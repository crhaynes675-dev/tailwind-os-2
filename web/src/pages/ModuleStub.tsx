import { WORKFLOWS, type Workflow } from '../domain/workflows';
import type { ModuleDef } from '../domain/modules';

// Which OS3 workflow(s) drive each module (process map → screen).
const MODULE_WORKFLOWS: Record<string, string[]> = {
  schedule: ['03'],
  dispatch: ['05'],
  delivery: ['04'],
  installation: ['05'],
  postinstall: ['06'],
  service: ['08', '09'],
};

function WorkflowCard({ wf }: { wf: Workflow }) {
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3.5" style={{ background: `${wf.color}12` }}>
        <span className="font-mono text-[0.7rem] text-faint">{wf.id}</span>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: wf.color }} />
        <span className="text-[0.82rem] font-semibold">{wf.title}</span>
        <span className="ml-auto rounded border border-white/10 px-2 py-0.5 font-mono text-[0.6rem] text-faint">
          {wf.steps.length} steps
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[0.74rem]">
          <thead>
            <tr className="text-[0.58rem] uppercase tracking-wider text-faint">
              <th className="px-4 py-2 font-semibold">#</th>
              <th className="px-4 py-2 font-semibold">Step</th>
              <th className="px-4 py-2 font-semibold">Owner</th>
              <th className="px-4 py-2 font-semibold">Key Input</th>
              <th className="px-4 py-2 font-semibold">Key Output</th>
            </tr>
          </thead>
          <tbody>
            {wf.steps.map((s, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="px-4 py-2.5 font-mono text-[0.66rem] text-faint">{String(i + 1).padStart(2, '0')}</td>
                <td className="px-4 py-2.5">
                  <span
                    className="rounded px-2 py-0.5 text-[0.66rem] font-semibold"
                    style={{ color: wf.color, background: `${wf.color}14`, border: `1px solid ${wf.color}40` }}
                  >
                    {s.step}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium text-text">{s.owner}</td>
                <td className="px-4 py-2.5 text-muted">{s.input}</td>
                <td className="px-4 py-2.5 text-muted">{s.output}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ModuleStub({ module }: { module: ModuleDef }) {
  const wfIds = MODULE_WORKFLOWS[module.id] ?? [];
  const wfs = WORKFLOWS.filter((w) => wfIds.includes(w.id));
  return (
    <>
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2 text-[0.62rem] font-semibold uppercase tracking-[0.25em] text-accent">
          Module
          {module.isNew && (
            <span className="rounded-full bg-accent2/20 px-1.5 py-px text-[0.5rem] font-bold text-accent2">new</span>
          )}
        </div>
        <h1 className="bg-gradient-to-r from-[#22d3ee] to-[#7c6cff] bg-clip-text text-[2rem] font-bold leading-none tracking-tight text-transparent">
          {module.label}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {wfs.length
            ? 'Planned screen — built from this OS3 workflow. Stage gates below.'
            : 'Planned module — UI is built in a later phase of the OS3 rebuild.'}
        </p>
      </div>

      {wfs.length > 0 ? (
        <div className="flex flex-col gap-5">
          {wfs.map((w) => (
            <WorkflowCard key={w.id} wf={w} />
          ))}
        </div>
      ) : (
        <div className="glass grid place-items-center rounded-2xl py-20 text-center">
          <div>
            <div className="text-sm font-semibold text-text">Coming in a later phase</div>
            <div className="mt-1 text-xs text-muted">This module is scaffolded in the OS3 navigation and will be built out next.</div>
          </div>
        </div>
      )}
    </>
  );
}
