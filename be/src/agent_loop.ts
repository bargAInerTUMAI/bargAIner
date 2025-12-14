import fs from 'fs';
import path from 'path';
import { Experimental_Agent as Agent, stepCountIs, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// list of results
export const jobStore: string[] = []; 

// message history (only actual messages, no tool outputs)
export const messageHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

const knowledgeBaseFolder = path.join(__dirname, "knowledge_base");

/**
 * Runs the agent loop for a given transcript and returns the result.
 * 
 * @param current_transcript - The current transcript from 11 labs.
 * @returns A promise that resolves to a result string. This string is sent to the frontend to be displayed to user.
 */
export async function runAgentLoop(current_transcript: string): Promise<void> { 

    // System prompt that defines the agent's role and behavior
    const systemPrompt = `
You are an expert Procurement Negotiation Assistant supporting a BUYER in a live negotiation.
You receive a transcript of only the last few seconds of conversation, which may be vague, incomplete, or silent.

OUTPUT FORMAT — STRICT:
- Your entire response MUST begin with a single bullet character ("•").
- Your response MUST contain exactly ONE bullet.
- The bullet MUST contain exactly ONE sentence.
- There must be NO text before or after the bullet.
- Any output that does not start with "•" is invalid.

LANGUAGE RESTRICTIONS:
- NEVER use first-person language (I, me, my, we).
- NEVER refer to instructions, rules, constraints, or the assistant.
- NEVER explain, clarify, or justify your output.

Your Goal:
Provide the single strongest buyer leverage move that can be said out loud verbatim.

How to Think (internal only):
1. Identify the strongest pressure point (price, justification, competition, urgency).
2. Select ONE move only.
3. Phrase it as a direct buyer statement.

Silence / Low-Content Handling:
If the transcript is vague, filler, or silent:
- Treat this as a strategic pause.
- Seize initiative with a power-shifting buyer move.

If uncertain, default to:
- Demanding justification
- Introducing competition
- Anchoring urgency
`;

    // Create the agent with tools
    const negotiationAgent = new Agent({
        model: anthropic('claude-haiku-4-5'),
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
                    
                    const apiKey = process.env.TAVILY_API_KEY;
                    if (!apiKey) {
                        console.log(`⚠️ [Tool] TAVILY_API_KEY not configured`);
                        return {
                            query: query,
                            error: 'Web search is not configured. Please set TAVILY_API_KEY environment variable.',
                            results: []
                        };
                    }

                    try {
                        const response = await fetch('https://api.tavily.com/search', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                api_key: apiKey,
                                query: query,
                                search_depth: 'basic', // 'basic' for speed, 'advanced' for depth
                                max_results: 1, // Limit results for faster response
                                include_answer: true, // Get AI-generated summary
                                include_raw_content: false, // Skip full content for speed
                            }),
                        });

                        if (!response.ok) {
                            const errorText = await response.text();
                            console.log(`❌ [Tool] Tavily API error (${response.status}):`, errorText);
                            return {
                                query: query,
                                error: `Search API error: ${response.status}`,
                                results: []
                            };
                        }

                        const data = await response.json() as {
                            answer?: string;
                            results?: Array<{
                                title: string;
                                url: string;
                                content: string;
                                score: number;
                            }>;
                        };
                        
                        console.log(`✅ [Tool] Tavily search completed: ${data.results?.length || 0} results`);
                        
                        if (data.answer) {
                            console.log(`🤖 [Tavily] AI Answer: ${data.answer}`);
                        }
                        
                        if (data.results && data.results.length > 0) {
                            console.log(`📋 [Tavily] Search Results:`);
                            data.results.forEach((result, index) => {
                                console.log(`   ${index + 1}. ${result.title}`);
                                console.log(`      URL: ${result.url}`);
                                console.log(`      Score: ${result.score}`);
                                console.log(`      Content: ${result.content.substring(0, 150)}...`);
                            });
                        }
                        
                        return {
                            query: query,
                            answer: data.answer || '', // AI-generated summary from Tavily
                            results: data.results?.map((r) => ({
                                title: r.title,
                                url: r.url,
                                content: r.content,
                                score: r.score
                            })) || []
                        };
                    } catch (error) {
                        console.log(`❌ [Tool] Error calling Tavily API:`, error);
                        return {
                            query: query,
                            error: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                            results: []
                        };
                    }
                },
            }),
        },
        stopWhen: stepCountIs(15), // Limit to 15 steps to ensure quick responses
    });

    const id = current_transcript.substring(0, 8);
    try {
        console.log(`\n🚀 [Agent ${id}] Starting agent loop...`);
        console.log(`📝 [Agent ${id}] Transcript:`, current_transcript.substring(0, 100) + '...');
        
        // Run the agent with the current transcript
        const result = await negotiationAgent.generate({
            messages: [
                ...messageHistory,
                { role: 'user', content: `Current transcript from the negotiation:\n\n"${current_transcript}"\n\nProvide 2-3 short, punchy bullet points the Buyer can use right now.` }
            ],
        });

        console.log(`✅ [Agent ${id}] Agent completed successfully`);
        console.log(`📊 [Agent ${id}] Steps taken:`, result.steps.length);
        console.log(`💬 [Agent ${id}] Final response:`, result.text);

        // Store the agent's final response
        jobStore.push(result.text);
        // Append the new user message and assistant response to history (no tool outputs)
        messageHistory.push({ role: 'user', content: current_transcript });
        if (result.text) {
            messageHistory.push({ role: 'assistant', content: result.text });
        }
        console.log(`🗃️ New Message History: ${JSON.stringify(messageHistory)}`);

        console.log(`🗃️ [Agent ${id}] Result stored. Current jobStore length: ${jobStore}`);
    } catch (error) {
        console.error(`❌ [Agent ${id}] Error running agent loop:`, error);
    }
}


export function poll(): string | undefined {
    return jobStore.shift();
}
