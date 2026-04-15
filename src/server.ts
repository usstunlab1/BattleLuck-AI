import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeBattleStrategy, generateBattleStats, simulateCombat } from "./battleIntel";

const server = new McpServer({ name: "vrisingbattleai", version: "1.0.0" });

server.registerTool(
  "analyze_battle_strategy",
  {
    title: "Analyze Battle Strategy",
    description: "Analyze battle scenarios and provide strategic recommendations",
    inputSchema: {
      scenario: z.string().describe("Battle scenario description"),
      playerLevel: z.number().optional().describe("Player level (1-100)"),
      enemyType: z.string().optional().describe("Type of enemy or opponent"),
    },
  },
  async ({ scenario, playerLevel = 50, enemyType = "unknown" }) => ({
    content: [{ type: "text", text: JSON.stringify(analyzeBattleStrategy({ scenario, playerLevel, enemyType }), null, 2) }],
  })
);

server.registerTool(
  "generate_battle_stats",
  {
    title: "Generate Battle Stats",
    description: "Generate combat statistics and power calculations for battle entities",
    inputSchema: {
      entityName: z.string().describe("Name of the battle entity"),
      entityType: z.enum(["warrior", "mage", "archer", "tank", "assassin", "support"]).describe("Type of battle entity"),
      level: z.number().min(1).max(100).describe("Entity level"),
    },
  },
  async ({ entityName, entityType, level }) => ({
    content: [{ type: "text", text: JSON.stringify(generateBattleStats({ entityName, entityType, level }), null, 2) }],
  })
);

server.registerTool(
  "simulate_combat",
  {
    title: "Simulate Combat",
    description: "Simulate a battle between two entities and predict outcomes",
    inputSchema: {
      attacker: z.object({ name: z.string(), level: z.number(), type: z.string() }).describe("Attacking entity"),
      defender: z.object({ name: z.string(), level: z.number(), type: z.string() }).describe("Defending entity"),
      battleType: z.enum(["quick", "extended", "siege"]).optional().describe("Battle type"),
    },
  },
  async ({ attacker, defender, battleType = "quick" }) => ({
    content: [{ type: "text", text: JSON.stringify(simulateCombat({ attacker, defender, battleType }), null, 2) }],
  })
);

export { server };
