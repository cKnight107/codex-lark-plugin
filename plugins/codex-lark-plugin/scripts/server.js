import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { executeTool, toolDefinitions } from "./lib/knowledge-tools.js";

function sendMessage(message) {
  const body = JSON.stringify(message);
  process.stdout.write(
    `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`
  );
}

function sendError(id, code, message) {
  sendMessage({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  });
}

export async function handleRequest(request, options = {}) {
  switch (request.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: "codex-feishu-knowledge",
            version: "0.2.0"
          },
          capabilities: {
            tools: {}
          }
        }
      };

    case "notifications/initialized":
      return null;

    case "ping":
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {}
      };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: toolDefinitions
        }
      };

    case "tools/call": {
      try {
        const result = await executeTool(
          request.params?.name,
          request.params?.arguments,
          options
        );

        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2)
              }
            ],
            structuredContent: result
          }
        };
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: error instanceof Error ? error.message : String(error)
              }
            ]
          }
        };
      }
    }

    default:
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32601,
          message: `未知方法: ${request.method}`
        }
      };
  }
}

async function startServer() {
  let buffer = "";

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", async (chunk) => {
    buffer += chunk;

    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");

      if (headerEnd === -1) {
        return;
      }

      const headerText = buffer.slice(0, headerEnd);
      const contentLengthLine = headerText
        .split("\r\n")
        .find((line) => line.toLowerCase().startsWith("content-length:"));

      if (!contentLengthLine) {
        sendError(null, -32600, "缺少 Content-Length 头。");
        buffer = "";
        return;
      }

      const contentLength = Number(contentLengthLine.split(":")[1]?.trim());
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;

      if (buffer.length < bodyEnd) {
        return;
      }

      const body = buffer.slice(bodyStart, bodyEnd);
      buffer = buffer.slice(bodyEnd);

      try {
        const request = JSON.parse(body);
        const response = await handleRequest(request);

        if (response) {
          sendMessage(response);
        }
      } catch (error) {
        sendError(
          null,
          -32700,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  });
}

const entryFile = process.argv[1]
  ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false;

if (entryFile) {
  startServer();
}
