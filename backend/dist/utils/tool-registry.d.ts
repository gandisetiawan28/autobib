export interface ToolDef {
    name: string;
    description: string;
    examples: string[];
}
export declare class ToolRegistry {
    private tools;
    registerTool(tool: ToolDef): void;
    getToolsInstruction(): string;
}
export declare const defaultRegistry: ToolRegistry;
//# sourceMappingURL=tool-registry.d.ts.map