import fs from 'fs';
import path from 'path';
import { Experimental_Agent as Agent, stepCountIs, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// list of results
export const jobStore: string[] = []; 

const knowledgeBaseFolder = path.join(__dirname, "knowledge_base");

/**
 * Runs the agent loop for a given transcript and returns the result.
 * 
 * @param counter - The monotonically increasing counter from the frontend.
 * @param current_transcript - The current transcript from 11 labs.
 * @returns A promise that resolves to a result string. This string is sent to the frontend to be displayed to user.
 */
export async function runAgentLoop(counter: number, current_transcript: string): Promise<void> { 

    // System prompt that defines the agent's role and behavior
    const systemPrompt = `
    You are an expert Procurement Negotiation Assistant. You support a BUYER in a live negotiation.
    You will receive a transcript of the last 30 seconds of conversation.

    Your Goal:
    Identify weak points, fact-check claims, or find leverage for the BUYER to use immediately.

    Your Process:
    1. ANALYZE: Quickly identify the product, price, or claim being discussed in the transcript.
    2. CHECK INTERNAL DATA: Use the listKnowledgeBaseFiles tool to see available files, then use readKnowledgeBaseFile to read relevant ones.
    3. CHECK EXTERNAL REALITY: If it makes sense, you may use webSearch tool to find competitor pricing, current commodity trends (e.g., "aluminum price trend"), or news that contradicts the seller.
    4. SYNTHESIZE: Output ONLY 2-3 short, punchy bullet points the Buyer can say *right now*.

    Guidelines:
    - KEEP IT BRIEF. The user has only seconds to read this.
    - Do NOT summarize the transcript. The user heard it. Only provide NEW information/arguments.
    `;

    // Create the agent with tools
    const negotiationAgent = new Agent({
        model: anthropic('claude-sonnet-4-20250514'),
        system: systemPrompt,
        tools: {
            listKnowledgeBaseFiles: tool({
                description: 'Lists all files available in the knowledge base that might contain relevant contract or pricing information',
                inputSchema: z.object({}),
                execute: async () => {
                    console.log(`🔍 [Tool] listKnowledgeBaseFiles called`);
                    try {
                        const files = fs.readdirSync(knowledgeBaseFolder);
                        console.log(`📂 [Tool] Found ${files.length} files:`, files);
                        return {
                            files: files,
                            message: 'Available files listed successfully'
                        };
                    } catch (error) {
                        console.log(`❌ [Tool] Error listing files:`, error);
                        return {
                            files: [],
                            message: 'Error reading knowledge base folder'
                        };
                    }
                },
            }),
            readKnowledgeBaseFile: tool({
                description: 'Reads the contents of a specific file from the knowledge base',
                inputSchema: z.object({
                    filename: z.string().describe('The name of the file to read'),
                }),
                execute: async ({ filename }) => {
                    console.log(`📖 [Tool] readKnowledgeBaseFile called with filename: ${filename}`);
                    try {
                        const filePath = path.join(knowledgeBaseFolder, filename);
                        // Security check: ensure the file is within the knowledge base folder
                        const normalizedPath = path.normalize(filePath);
                        if (!normalizedPath.startsWith(knowledgeBaseFolder)) {
                            console.log(`⚠️ [Tool] Access denied for file: ${filename}`);
                            return {
                                content: '',
                                error: 'Access denied: file must be in knowledge base folder'
                            };
                        }
                        const content = fs.readFileSync(filePath, 'utf-8');
                        console.log(`✅ [Tool] Successfully read file: ${filename} (${content.length} chars)`);
                        return {
                            content: content,
                            filename: filename
                        };
                    } catch (error) {
                        console.log(`❌ [Tool] Error reading file ${filename}:`, error);
                        return {
                            content: '',
                            error: `Error reading file: ${filename}`
                        };
                    }
                },
            }),
            webSearch: tool({
                description: 'Searches the web for current information about pricing, market trends, or competitor information. Use this to fact-check claims or find leverage.',
                inputSchema: z.object({
                    query: z.string().describe('The search query (e.g., "aluminum price trend 2025", "competitor pricing for X")'),
                }),
                execute: async ({ query }) => {
                    console.log(`🌐 [Tool] webSearch called with query: "${query}"`);
                    // Note: This is a placeholder. In production, integrate with a real web search API
                    // such as Tavily, Serper, or Bing Search API
                    console.log(`⚠️ [Tool] Web search not yet implemented (placeholder)`);
                    return {
                        query: query,
                        results: 'Web search not yet implemented. Please use internal data or mock results for now.',
                        note: 'To enable web search, integrate with a search API like Tavily or Serper'
                    };
                },
            }),
        },
        stopWhen: stepCountIs(15), // Limit to 15 steps to ensure quick responses
    });

    try {
        console.log(`\n🚀 [Agent ${counter}] Starting agent loop...`);
        console.log(`📝 [Agent ${counter}] Transcript:`, current_transcript.substring(0, 100) + '...');
        
        // Run the agent with the current transcript
        const result = await negotiationAgent.generate({
            prompt: `Current transcript from the negotiation:\n\n"${current_transcript}"\n\nProvide 2-3 short, punchy bullet points the Buyer can use right now.`,
        });

        console.log(`✅ [Agent ${counter}] Agent completed successfully`);
        console.log(`📊 [Agent ${counter}] Steps taken:`, result.steps.length);
        console.log(`💬 [Agent ${counter}] Final response:`, result.text);

        // Store the agent's final response
        jobStore.push(result.text);
    } catch (error) {
        console.error(`❌ [Agent ${counter}] Error running agent loop:`, error);
    }
}


export function poll(): string | undefined {
    return jobStore.shift();
}
