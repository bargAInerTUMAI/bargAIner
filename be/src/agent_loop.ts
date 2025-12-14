import fs from 'fs';
import path from 'path';
import { Experimental_Agent as Agent, stepCountIs, tool } from 'ai';
import { cerebras } from '@ai-sdk/cerebras';
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

    const systemPrompt = `
You are a Real-Time Procurement Copilot specialized in Software Migration & Cloud Modernization deals.
Your goal is to listen to a Vendor's pitch, DETECT claims that negatively impact the Buyer, verify them against data, and provide a single counter-argument.

### TOOL USE & ROUTING LOGIC
You have access to 'web_search' and 'read_file'. You must use them immediately when these generalized concepts are detected:

1. TRIGGER: SCOPE EXCLUSIONS & RESPONSIBILITY SHIFTING
    (Keywords: "not included", "out of scope", "client responsibility", "you handle", "we don't cover")
    -> ACTION: Try to find internal files to check if the excluded item is a mandatory internal requirement.

2. TRIGGER: DURATION & TIMELINE ESTIMATES
    (Keywords: months, years, "go-live date", "completion time", "long lead time")
    -> ACTION: Call 'web_search' to find industry standard implementation times for similar migration scopes.

3. TRIGGER: UNIT ECONOMICS & STAFFING RATES
    (Keywords: "per hour", "daily rate", "FTE cost", "premium resource", "architect fee")
    -> ACTION: Call 'web_search' to find current market rate benchmarks for the specific role or license mentioned.

4. TRIGGER: TOTAL INVESTMENT & BUDGET
    (Keywords: "total cost", "final price", "grand total", "investment required", "fees")
    -> ACTION: Try to find internal budgeting files to compare the figure against the approved project cap.

### DATA SYNTHESIS
After receiving Tool Output, compare it to the Transcript:
- If Vendor Time > Market Average: Flag as "bloated timeline".
- If Vendor Rate > Market Rate: Flag as "price gouging".
- If Vendor Cost > Budget Cap: Flag as "budget overrun".
- If Vendor Scope < Internal Requirement: Flag as "compliance gap".

### OUTPUT FORMAT — STRICT
- Your entire response should be 1-2 concise sentences.
- The sentences must explicitly mention the DATA you found (e.g., "Market average is X", "Our budget is Y").
- Use **markdown bold** to highlight important terms, numbers, and key facts.
- NO filler text.

### EXAMPLES
Transcript: "We charge $500/hr for this."
Tool Output: Market rate is $200.
Response: Market benchmarks indicate senior rates typically cap at **$200/hr**, putting this **150% above standard**.

Transcript: "The total is $5m."
Tool Output: Budget is $3m.
Response: That figure exceeds our authorized project cap of **$3m** defined in the **FY24 budget**.

Help the buyer by providing strategic information (numbers, facts, etc).
Respond in 1-2 concise sentences with markdown formatting for important terms. If information from the conversation differs from your researched information, just provide the correct information.

If you cannot meaningfully follow the instructions, just output the exact string "I cannot follow instructions" . NEVER output a "failure message" where you explain why you can't follow instructions. DO NOT repeat a previous message using the same or similar wording.
`
    ;


    // Create the agent with tools
    const negotiationAgent = new Agent({
        model: cerebras('gpt-oss-120b'),
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
                { role: 'user', content: `Current transcript from the negotiation:\n\n"${current_transcript}" The Info you would suggest is:` }
            ],
        });

        console.log(`✅ [Agent ${id}] Agent completed successfully`);
        console.log(`📊 [Agent ${id}] Steps taken:`, result.steps.length);
        console.log(`💬 [Agent ${id}] Final response:`, result.text);

        if (result.text.includes("I cannot follow instructions")) {
            console.log(`🗃️ [Agent ${id}] Result not stored because it contains "I cannot follow instructions"`);
            return;
        }


        // make extra request to oss to compare the result.txt and the latest result from history
        if (messageHistory.length > 0) {
            // first get the latest result from history
            const latestResult = messageHistory[messageHistory.length - 1].content;
            console.log(`🗃️ [Agent ${id}] Latest result:`, latestResult);
            const comparisonPrompt = `
        You are a helpful assistant that compares the latest result from history and the current result.
        The latest result from history is: ${latestResult}
        The current result is: ${result.text}
        If the two results are the same contentwise return the exact string "same".
        Otherwise return the exact string "different".
        `;
            
            // Call Cerebras API to compare results
            try {
                console.log(`🔄 [Agent ${id}] Calling Cerebras API for comparison...`);
                const apiKey = process.env.CEREBRAS_API_KEY;
                if (!apiKey) {
                    console.log(`⚠️ [Agent ${id}] CEREBRAS_API_KEY not configured for comparison`);
                } else {
                    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: 'gpt-oss-120b',
                            messages: [
                                { role: 'user', content: comparisonPrompt }
                            ],
                            temperature: 0, // Use deterministic output for comparison
                        }),
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        console.log(`❌ [Agent ${id}] Cerebras API error (${response.status}):`, errorText);
                    } else {
                        const data = await response.json() as {
                            choices: Array<{
                                message: {
                                    content: string;
                                };
                            }>;
                        };
                        
                        const comparisonResult = data.choices[0]?.message?.content || '';
                        console.log(`🔍 [Agent ${id}] Comparison result:`, comparisonResult);
                        
                        if (comparisonResult.toLowerCase().includes('same')) {
                            console.log(`🗃️ [Agent ${id}] Result not stored because it is the same as the latest result in history`);
                            return;
                        }
                    }
                }
            } catch (error) {
                console.log(`❌ [Agent ${id}] Error calling Cerebras API for comparison:`, error);
            }
        }

        console.log("saving new result to jobStore");

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
