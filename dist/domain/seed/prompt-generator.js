/**
 * Utility to generate a copy-pasteable initialization prompt for external web LLMs (BYOD).
 */
export class SeedPromptGenerator {
    /**
     * Generate structured BYOD initialization prompt template.
     * @param currentDate - Optional campaign start date (defaults to current system date ISO).
     */
    static generateInitializationPrompt(currentDate = new Date().toISOString().split('T')[0]) {
        return `[GeoPolis Simulation Engine — World Seed Delta Patch Prompt]
Campaign Start Date: ${currentDate}

Instructions for LLM:
You are acting as the geopolitical data initializer for GeoPolis Simulation Engine.
Your task is to analyze the current real-world status as of ${currentDate} and generate a compact JSON Delta Patch for active geopolitical crises, active wars, significant political stability changes, or major economic indicator shifts.

RULES:
1. Output ONLY a raw valid JSON object inside a single \`\`\`json block. Do NOT include prose before or after.
2. Omit stable nations that have not experienced major changes (the engine will use base defaults).
3. Use ISO-3166 country codes or standard IDs (e.g., "country-us", "country-br", "country-ua", "country-ru").
4. Express percentages/fractions as decimals between 0.0 and 1.0 (e.g., 0.85 for 85%).

REQUIRED JSON SCHEMA:
{
  "scenarioId": "byod-${currentDate}",
  "campaignStartDate": "${currentDate}",
  "patchDescription": "Real-world geopolitical state delta patch as of ${currentDate}",
  "entityPatches": [
    {
      "id": "country-us",
      "name": "United States",
      "components": [
        {
          "type": "economy.indicator",
          "gdp": 28700,
          "inflationRate": 0.028,
          "treasury": 1800,
          "taxRate": 0.24
        },
        {
          "type": "politics.stability",
          "stabilityIndex": 0.65,
          "approvalRating": 0.48,
          "militaryLoyalty": 0.95
        }
      ]
    }
  ]
}

Please generate the JSON patch for the current world state as of ${currentDate}:`;
    }
}
//# sourceMappingURL=prompt-generator.js.map