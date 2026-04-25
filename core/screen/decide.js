import { agent, SESSION_THREAD } from "../agent/graph.js";
import { speak } from "../index.js";
import { createWorker } from "tesseract.js";

// Temporary Constants (move to thresholds.js)
const SPEAK_COOLDOWN    = 120000;  // 2 min between any speech
const OCR_COOLDOWN      = 120000;  // 2 min between OCR triggers
const IDLE_COOLDOWN     = 600000;  // 10 min between idle check-ins
const REPEAT_GUARD      = 600000;  // 10 min after ignored suggestion
const OCR_DIFF_THRESHOLD = 0.05;   // min diffScore to run OCR
const FLOW_TICKS        = 3;       // consecutive typing ticks = flow state
const SPIKE_THRESHOLD   = 0.25;    // diffScore = sudden change
const STATIC_THRESHOLD  = 0.05;    // diffScore = nothing happening
const SPIKE_PATIENCE    = 60000;   // ms before acting on unaddressed spike
const REACTION_WINDOW   = 2000;    // ms to wait after spike before scoring

const BLACKLISTED_APPS = [
    "whatsapp", "instagram", "facebook", "twitter", "x.com",
    "threads", "tiktok", "snapchat", "telegram", "youtube",
    "spotify", "netflix", "prime video", "hulu", "vlc", "discord"
];

// OCR Worker 
let ocrWorker = null;
async function getWorker() {
    if (!ocrWorker) {
        ocrWorker = await createWorker('eng');
    }
    return ocrWorker;
}

// Main Decision Function 
export async function decide(diffData, currentContext, state, persona) {

    const now = Date.now();

    // Gate 0: First Tick 
    // No baseline exists yet. Skip entirely.
    if (diffData.firstTick) return;

    // Gate 1: Sleep Mode 
    // Hard wall. Nothing passes except wake word.
    if (state.isSleeping && !state.isWakeWord) return;

    // Gate 2: Global Speak Cooldown 
    // Argus spoke recently. Don't stack triggers.
    if (state.lastSpokeAt && (now - state.lastSpokeAt < SPEAK_COOLDOWN)) return;

    // Gate 3: Blacklist 
    const appTitle   = (currentContext.app.title || "").toLowerCase();
    const appProcess = (currentContext.app.processName || "").toLowerCase();
    const isBlacklisted = BLACKLISTED_APPS.some(app =>
        appTitle.includes(app) || appProcess.includes(app)
    );
    if (isBlacklisted && !state.isWakeWord && !persona?.user?.deadlines) {
        console.log(`[◈ argus] Blacklisted app (${currentContext.app.title}). Skipping.`);
        return;
    }

    // Gate 4: Wake Word Express Lane 
    // Bypasses all screen logic. Always fires.
    if (state.isWakeWord) {
        console.log(`[◈ argus] Wake word received.`);
        await invokeAgent(state, currentContext, diffData, persona, now, {
            reason: "wake_word",
            userMessage: state.lastUserMessage || "Hey Argus.",
            resetWakeWord: true,
        });
        return;
    }

    // Gate 5: Idle Check-In 
    // Screen hasn't changed + user has been idle 5+ min.
    if (!diffData.isChanged && state.screen?.idleSeconds >= 300) {
        if (state.lastIdleCheckIn && (now - state.lastIdleCheckIn < IDLE_COOLDOWN)) return;
        console.log(`[◈ argus] Idle check-in.`);
        await invokeAgent(state, currentContext, diffData, persona, now, {
            reason: "idle_checkin",
            userMessage: `Screen idle for ${Math.floor(state.screen.idleSeconds / 60)} minutes. Gently check in.`,
            setIdleCheckIn: true,
        });
        return;
    }

    // Gate 6: No Change, No Idle 
    if (!diffData.isChanged) return;

    // Gate 7: Flow Protection 
    // Small consistent diffs = user is typing. Do not interrupt.
    const isFlowing = diffData.diffScore > 0.02
        && diffData.diffScore < 0.15
        && diffData.dominantRegions.length <= 3;

    if (isFlowing) {
        state.flowTickCount = (state.flowTickCount || 0) + 1;
        if (state.flowTickCount >= FLOW_TICKS) {
            console.log(`[◈ argus] Flow state detected. Suppressing.`);
            return;
        }
    } else {
        state.flowTickCount = 0;
    }

    // Gate 8: Repeat Guard 
    // User ignored last suggestion within 10 min. Don't repeat.
    if (state.lastIgnoredAt && (now - state.lastIgnoredAt < REPEAT_GUARD)) return;

    // Gate 9: Spike-then-Static Pattern 
    // Something appeared on screen and user hasn't reacted.
    const isSpike  = diffData.diffScore > SPIKE_THRESHOLD;
    const isStatic = diffData.diffScore < STATIC_THRESHOLD;

    if (isSpike && !state.spikeDetectedAt) {
        state.spikeDetectedAt = now;
        console.log(`[◈ argus] Spike detected. Starting patience timer.`);
        return;
    }

    if (state.spikeDetectedAt) {
        const spikeAge = now - state.spikeDetectedAt;
        if (isStatic) {
            if (spikeAge < REACTION_WINDOW) return; // too soon
            if (spikeAge > SPIKE_PATIENCE) {
                console.log(`[◈ argus] Spike unaddressed for ${Math.floor(spikeAge / 1000)}s. Intervening.`);
                await invokeAgent(state, currentContext, diffData, persona, now, {
                    reason: "spike_then_static",
                    userMessage: "Something appeared on screen and the user hasn't reacted. Analyze and help if needed.",
                });
                state.spikeDetectedAt = null;
                return;
            }
        } else {
            state.spikeDetectedAt = null; // user reacted, reset
        }
    }

    // Gate 10: High Visual Entropy 
    // Large non-uniform change. Not video (video = all regions uniform).
    if (diffData.diffScore > 0.4 && diffData.dominantRegions.length >= 5 && !diffData.app.changed) {
        const isUniform = diffData.regions.every(r => r.diff > 0.3);
        if (isUniform) {
            console.log(`[◈ argus] Uniform high diff — likely video. Skipping.`);
            return;
        }
        await invokeAgent(state, currentContext, diffData, persona, now, {
            reason: "high_visual_entropy",
            userMessage: "Significant non-uniform screen change. Analyze and help if needed.",
        });
        return;
    }

    // Gate 11: App Switch 
    if (diffData.app.changed) {
        state.screen = state.screen || {};
        state.screen.previousApp = state.screen.currentApp;
        state.screen.currentApp  = currentContext.app.processName;
        state.distractionStart   = state.distractionStart || now;

        const distractionMins = (now - state.distractionStart) / 60000;
        const threshold = persona?.user?.distraction_threshold || 8;

        console.log(`[◈ argus] App switch → ${currentContext.app.processName}. Distracted ${distractionMins.toFixed(1)} min.`);

        if (distractionMins >= threshold) {
            await invokeAgent(state, currentContext, diffData, persona, now, {
                reason: "distraction_timer",
                userMessage: `User has been away from their work for ${Math.floor(distractionMins)} minutes.`,
            });
            state.distractionStart = null;
        }
        return;
    }

    // Gate 12: OCR Sentry 
    // Only runs if bottom-row regions changed (terminal/console area).
    if (diffData.diffScore > OCR_DIFF_THRESHOLD) {
        const bottomRowChanged = diffData.dominantRegions.some(r => r >= 4);
        if (!bottomRowChanged) return;

        const worker = await getWorker();
        const { data: { text } } = await worker.recognize(currentContext.screenshot);

        if (/error|failed|exception|critical|denied|cannot|undefined/i.test(text)) {
            if (!state.lastOcrTrigger || (now - state.lastOcrTrigger > OCR_COOLDOWN)) {
                state.lastOcrTrigger = now;
                console.log(`[◈ argus] OCR error signal detected.`);
                await invokeAgent(state, currentContext, diffData, persona, now, {
                    reason: "ocr_error_detected",
                    userMessage: `Potential error detected: "${text.substring(0, 120)}". Help troubleshoot.`,
                });
            }
        }
    }
}

// Agent Invocation 
async function invokeAgent(state, currentContext, diffData, persona, now, opts) {
    const { reason, userMessage, resetWakeWord, setIdleCheckIn } = opts;

    console.log(`[◈ argus] → ${reason}`);

    const response = await agent.invoke({
        ...state,
        isWakeWord: resetWakeWord ? false : state.isWakeWord,
        persona,
        screenshot: currentContext.screenshot,
        appContext:  currentContext.app,
        diffData,
        triggerReason: reason,
        userMessage,
    }, SESSION_THREAD);

    if (response.speechText) {
        state.lastSpokeAt = now;
        if (setIdleCheckIn) state.lastIdleCheckIn = now;
        speak(response.speechText);
    }
}