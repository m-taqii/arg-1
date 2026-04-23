import { agent } from "../agent/graph.js";
import { speak } from "../index.js";
import { createWorker } from "tesseract.js";

let ocrWorker = null;
async function getWorker() {
    if (!ocrWorker) {
        ocrWorker = await createWorker('eng');
    }
    return ocrWorker;
}

export async function decide(diffData, currentContext, state, persona) {

    const BLACKLISTED_APPS = [
        "whatsapp", "instagram", "facebook", "twitter", "x.com", 
        "threads", "tiktok", "snapchat", "telegram", "youtube", 
        "spotify", "netflix", "prime video", "hulu", "vlc", "discord"
    ];

    const appTitle = (currentContext.app.title || "").toLowerCase();
    const appProcess = (currentContext.app.processName || "").toLowerCase();

    const isDistracted = BLACKLISTED_APPS.some(app => 
        appTitle.includes(app) || appProcess.includes(app)
    );

    // Gate 0: Check for blacklisted app
    if(isDistracted && !state.isWakeWord && !persona?.user?.deadlines) {
        console.log(`[argus] App is in blacklist (${currentContext.app.title}). Ignoring.`);
        return;
    }

    let shouldInvoke = false;
    let reason = "";
    let userMessage = "";

    // Gate 1: Wake Word
    if(state.isWakeWord) {
        state.isWakeWord = false;
        shouldInvoke = true;
        reason = "User explicitly called for Argus";
        userMessage = state.lastUserMessage || "Hello Argus. Can you help me?";
    }

    // Gate 2: Screen Idle
    else if(!diffData.isChanged && state.screen.idleSeconds >= 300) {
        shouldInvoke = true;
        reason = "Screen has been idle for 5 minutes";
        userMessage = `The screen has been idle for ${Math.floor(state.screen.idleSeconds / 60)} minutes. Gently check in with the user or nudge them to return to their goals.`;
    }

    // If screen didn't change and we haven't hit the 5 min idle mark, do nothing.
    else if (!diffData.isChanged) {
        return;
    }

    // Gate 3: High Visual Entropy
    else if((diffData.diffScore > 0.4 || diffData.dominantRegions.length >= 5) && !diffData.app.changed) {
        shouldInvoke = true;
        reason = "High visual activity detected on screen";
        userMessage = "A significant visual change occurred. Analyze the screen layout and offer assistance if something looks confusing or complex.";
    }

    // Gate 4: App Switch
    else if(state.screen.previousApp !== state.screen.currentApp) {
        console.log(`[argus] Context switched to ${currentContext.app.processName}`);
    }

    // Gate 5: Local OCR Sentry
    else if (diffData.isChanged && diffData.diffScore > 0.005) {
        const worker = await getWorker();
        const { data: { text } } = await worker.recognize(currentContext.screenshot);
        
        if (/error|failed|exception|critical|denied/i.test(text)) {
            const now = Date.now();
            // 5-minute silent cooldown for OCR errors to prevent infinite triggering
            if (!state.lastOcrTrigger || now - state.lastOcrTrigger > 300000) {
                state.lastOcrTrigger = now;
                shouldInvoke = true;
                reason = "Visual error detected by local OCR";
                userMessage = `A potential error was detected by OCR: "${text.substring(0, 80)}...". Read the screen and help the user troubleshoot the issue.`;
            }
        }
    }

    // EXECUTION
    if (shouldInvoke) {
        console.log(`[argus] Decision: Waking Brain. Reason: ${reason}`);
        
        const response = await agent.invoke({
            ...state,
            persona: persona,
            screenshot: currentContext.screenshot,
            appContext: currentContext.app,
            diffData,
            triggerReason: reason,
            userMessage: userMessage,
        });

        if (response.speechText) {
            speak(response.speechText);
        }
    }
}