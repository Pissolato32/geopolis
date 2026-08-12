export function formatActionResponse(actionType: string): object {
  return { actionType, status: 'processed' };
}
