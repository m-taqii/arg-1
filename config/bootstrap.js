import fs from 'fs'
import path from 'path'
import { getSkillNames } from '../core/agent/tools/tools.js'

export async function buildPrompt(state) {
    const { persona, screen, trigger } = state

    const templatePath = path.join(process.cwd(), 'config', 'MASTER_TEMPLATE.xml')
    let prompt = fs.readFileSync(templatePath, 'utf-8')

    const mapping = {
        '{{user_name}}': persona.user.name,
        '{{current_doing}}': (persona.user.doing || []).join(', '),
        '{{deadlines}}': (persona.user.deadlines || []).join(', '),
        '{{goals}}': (persona.user.goals || []).join(', '),
        '{{work_style}}': persona.user.workStyle || 'Not specified',
        '{{timezone}}': persona.user.timezone || 'UTC',
        '{{tone}}': persona.preferences.tone || 'friendly',
        '{{language}}': persona.preferences.language || 'en',
        '{{interruption_sensitivity}}': persona.preferences.interruptionSensitivity || 'medium',
        '{{distraction_threshold}}': persona.preferences.distractionThreshold || 5,
        '{{total_sessions}}': persona.memory.totalSessions || 0
    }

    const dynamicMapping = {
        '{{session_summary}}': state.session?.summary || 'Session started.',
        '{{scene_object}}': JSON.stringify(screen, null, 2),
        '{{trigger_reason}}': trigger || 'Periodic screen analysis.',
        '{{observed_patterns}}': (persona.memory.notes || []).map(entry => entry.note).join('; ') || 'No patterns observed yet.',
        '{{memory_notes}}': 'No long-term memory notes yet.',
        '{{skills_available}}': getSkillNames().join(', ') || 'No skills installed'
    }

    const finalMapping = { ...mapping, ...dynamicMapping }

    for (const [key, value] of Object.entries(finalMapping)) {
        prompt = prompt.split(key).join(value || 'None')
    }

    return prompt
}
