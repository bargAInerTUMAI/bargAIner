import fs from 'fs';
import path from 'path';
import { Experimental_Agent as Agent, stepCountIs, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// map from counter to result
export const jobStore = new Map<number, string>(); 

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
                                max_results: 3, // Limit results for faster response
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
        jobStore.set(counter, result.text);
    } catch (error) {
        console.error(`❌ [Agent ${counter}] Error running agent loop:`, error);
        jobStore.set(counter, 'Error: Unable to generate negotiation advice. Please try again.');
    }
}

