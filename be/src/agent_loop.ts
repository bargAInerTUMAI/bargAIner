// map from counter to result
export const jobStore = new Map<number, string>(); 

/**
 * Runs the agent loop for a given transcript and returns the result.
 * 
 * @param counter - The monotonically increasing counter from the frontend.
 * @param current_transcript - The current transcript from 11 labs.
 * @returns A promise that resolves to a result string. This string is sent to the frontend to be displayed to user.
 */
export async function runAgentLoop(counter: number, current_transcript: string): Promise<void> { 

    // TODO do AI magic
    const result = "result";

    // add the job to the store
    jobStore.set(counter, result); 
}