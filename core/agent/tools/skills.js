import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { tool } from "@langchain/core/tools"
import { z } from "zod"

const SKILLS_DIR = path.join(process.cwd(), 'skills')

// Scans the skills/ directory and returns an array of skill names.
export function getSkillNames() {
    if (!fs.existsSync(SKILLS_DIR)) return []
    return fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, e.name, 'skill.md')))
        .map(e => e.name)
}

// Reads the skill.md instructions for a given skill.
function readSkillInstructions(skillName) {
    const mdPath = path.join(SKILLS_DIR, skillName, 'skill.md')
    if (!fs.existsSync(mdPath)) return null
    return fs.readFileSync(mdPath, 'utf-8')
}

// Lists all runnable scripts (.js / .py) inside a skill folder.
function listSkillScripts(skillName) {
    const skillPath = path.join(SKILLS_DIR, skillName)
    if (!fs.existsSync(skillPath)) return []
    return fs.readdirSync(skillPath)
        .filter(f => f.endsWith('.js') || f.endsWith('.py'))
}

// Executes a script inside a skill folder.
function runScript(skillName, scriptName, args = []) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(SKILLS_DIR, skillName, scriptName)
        if (!fs.existsSync(scriptPath)) return reject(new Error(`Script not found: ${scriptPath}`))

        const lang = scriptName.endsWith('.py') ? 'python' : 'node'
        const child = spawn(lang, [scriptPath, ...args], {
            cwd: path.join(SKILLS_DIR, skillName),
            timeout: 30000,
        })

        let stdout = ''
        let stderr = ''
        child.stdout.on('data', d => { stdout += d.toString() })
        child.stderr.on('data', d => { stderr += d.toString() })
        child.on('close', code => resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code }))
        child.on('error', err => reject(err))
    })
}

export const executeSkillTool = tool(
    async ({ skill_name, script_name, args }) => {
        const skills = getSkillNames()
        if (!skills.includes(skill_name)) {
            return `Error: Skill "${skill_name}" not found. Available skills: ${skills.join(', ') || 'none'}`
        }

        const instructions = readSkillInstructions(skill_name)
        const availableScripts = listSkillScripts(skill_name)

        if (!script_name) {
            return `Skill "${skill_name}" loaded.\nInstructions:\n${instructions}\nAvailable scripts: ${availableScripts.join(', ') || 'none'}`
        }

        if (!availableScripts.includes(script_name)) {
            return `Error: Script "${script_name}" not found in skill "${skill_name}". Available: ${availableScripts.join(', ')}`
        }

        try {
            const result = await runScript(skill_name, script_name, args || [])
            let output = `[exit: ${result.code}]`
            if (result.stdout) output += `\nstdout: ${result.stdout}`
            if (result.stderr) output += `\nstderr: ${result.stderr}`
            return output
        } catch (err) {
            return `Execution failed: ${err.message}`
        }
    },
    {
        name: "execute_skill",
        description: "Execute a user-defined skill from the skills/ folder. Provide the skill name (folder name) and optionally a script to run within it. If no script_name is given, returns the skill's instructions and available scripts.",
        schema: z.object({
            skill_name: z.string().describe("The name of the skill folder to use"),
            script_name: z.string().optional().describe("The script file to execute inside the skill folder (e.g. 'greet.js')"),
            args: z.array(z.string()).optional().describe("Arguments to pass to the script"),
        }),
    }
)
