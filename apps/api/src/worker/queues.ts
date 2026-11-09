/** BullMQ queue names (shared by the worker and anything that enqueues). */
export const SYNC_QUEUE = 'erp-sync';

/** BullMQ forbids ':' in custom job ids. */
export const syncRunJobId = (configId: string) => `run-${configId}`;
