import {activeWindow} from 'get-windows';

export async function getActiveApp() {
  const active = await activeWindow();
  if (!active) return { title: 'unknown', processName: 'unknown', processId: null };
  return {
    title: active.title,
    processName: active.owner.name,
    processId: active.owner.processId,
  };
}