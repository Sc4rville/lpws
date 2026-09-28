/** jobs.ts : ce qui prend du temps (capture, test, brain, publication) se suit ligne par ligne. */
import { spawn } from "node:child_process"
import { ROOT } from "./config.ts"

export type Job = { id: string; type: string; etat: "en cours" | "ok" | "échec"; lignes: string[]; debut: string; fin?: string; resultat?: unknown; campagne?: string; sujet?: string }
export const jobs = new Map<string, Job>()
export function nouveauJob(type: string): Job {
  const job: Job = { id: Math.random().toString(36).slice(2, 10), type, etat: "en cours", lignes: [], debut: new Date().toISOString() }
  jobs.set(job.id, job)
  return job
}
/** les codes couleur des CLI (vercel…) n'ont rien à faire à l'écran */
export const dire = (job: Job, l: string) => { for (const x of l.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").split(/\r?\n/)) if (x.trim()) { job.lignes.push(x); if (job.lignes.length > 400) job.lignes.shift() } }
export function finir(job: Job, ok: boolean, resultat?: unknown) { job.etat = ok ? "ok" : "échec"; job.fin = new Date().toISOString(); job.resultat = resultat }
/** un sous-processus dont on garde les lignes ; le code de sortie dit s'il a réussi */
export function lancer(job: Job, cmd: string, args: string[], cwd = ROOT): Promise<number> {
  return new Promise((res) => {
    dire(job, `$ ${[cmd, ...args].map((a) => a.includes(" ") ? `"${a}"` : a).join(" ").replace(ROOT + "/", "")}`)
    const p = spawn(cmd, args, { cwd, env: process.env })
    p.stdout.on("data", (d) => dire(job, String(d)))
    p.stderr.on("data", (d) => dire(job, String(d)))
    p.on("error", (e) => { dire(job, `erreur : ${e.message}`); res(1) })
    p.on("close", (code) => res(code ?? 1))
  })
}
