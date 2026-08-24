export interface WorkerOptions {
  poll: () => Promise<void>;
  once?: boolean;
}

export async function startWorker(options: WorkerOptions): Promise<void> {
  do {
    await options.poll();
  } while (!options.once);
}
