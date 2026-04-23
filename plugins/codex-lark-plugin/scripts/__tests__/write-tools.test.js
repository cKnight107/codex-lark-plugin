import assert from "node:assert/strict";
import test from "node:test";

import { FeishuApiError } from "../lib/feishu-client.js";
import { contentToBlocks } from "../lib/feishu-doc-write.js";
import { executeTool } from "../lib/knowledge-tools.js";
import { handleRequest } from "../server.js";

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

function createWriteEnv(overrides = {}) {
  return {
    LARK_FEISHU_WRITE_ENABLED: "true",
    LARK_FEISHU_TOKEN_MODE: "tenant",
    LARK_FEISHU_APP_ID: "cli_test",
    LARK_FEISHU_APP_SECRET: "secret_test",
    ...overrides
  };
}

test("contentToBlocks 支持 plain_text 与最小 Markdown 子集", () => {
  assert.deepEqual(
    contentToBlocks("第一段\n\n第二段", "plain_text").map((block) => block.block_type),
    [2, 2]
  );

  const markdownBlocks = contentToBlocks(
    "# 标题\n\n正文\n\n- 要点\n1. 步骤\n> 引用\n---",
    "markdown"
  );

  assert.deepEqual(
    markdownBlocks.map((block) => block.block_type),
    [3, 2, 12, 13, 15, 22]
  );
  assert.equal(
    markdownBlocks[0].heading1.elements[0].text_run.content,
    "标题"
  );
});

test("未开启写入开关时写入 tool fail fast 且不请求飞书", async () => {
  let requested = false;

  await assert.rejects(
    () =>
      executeTool(
        "create_feishu_doc",
        { folder_token: "fldcn_parent", title: "测试" },
        {
          env: {},
          fetchImpl: async () => {
            requested = true;
            return createJsonResponse(500, {});
          }
        }
      ),
    /LARK_FEISHU_WRITE_ENABLED=true/
  );

  assert.equal(requested, false);
});

test("MCP 写入调用在禁用时返回结构化错误", async () => {
  const response = await handleRequest(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "create_feishu_folder",
        arguments: {
          parent_folder_token: "fldcn_parent",
          name: "测试文件夹"
        }
      }
    },
    { env: {} }
  );

  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /LARK_FEISHU_WRITE_ENABLED=true/);
});

test("create_feishu_doc 会创建文档并按内容写入根块", async () => {
  const requests = [];

  const result = await executeTool(
    "create_feishu_doc",
    {
      folder_token: "fldcn_parent",
      title: "写入测试",
      content: "# 标题\n\n正文",
      content_type: "markdown"
    },
    {
      env: createWriteEnv(),
      fetchImpl: async (url, init) => {
        requests.push({
          url: String(url),
          method: init.method,
          body: init.body
        });

        if (String(url).includes("tenant_access_token")) {
          return createJsonResponse(200, {
            code: 0,
            msg: "ok",
            tenant_access_token: "t_write",
            expire: 7200
          });
        }

        if (String(url).endsWith("/docx/v1/documents")) {
          return createJsonResponse(200, {
            code: 0,
            msg: "ok",
            data: {
              document: {
                document_id: "doxcn_created",
                title: "写入测试"
              }
            }
          });
        }

        return createJsonResponse(200, {
          code: 0,
          msg: "ok",
          data: {
            children: [{ block_id: "blk_heading" }, { block_id: "blk_text" }]
          }
        });
      }
    }
  );

  assert.equal(result.document_id, "doxcn_created");
  assert.equal(result.content_written, true);
  assert.equal(result.written_block_count, 2);
  assert.equal(requests[2].method, "POST");
  assert.match(
    requests[2].url,
    /docx\/v1\/documents\/doxcn_created\/blocks\/doxcn_created\/children/
  );
  assert.match(requests[2].body, /"block_type":3/);
});

test("edit_feishu_doc 支持 append、insert 与 update_text", async () => {
  const requests = [];

  async function fetchImpl(url, init) {
    requests.push({
      url: String(url),
      method: init.method,
      body: init.body
    });

    if (String(url).includes("tenant_access_token")) {
      return createJsonResponse(200, {
        code: 0,
        msg: "ok",
        tenant_access_token: "t_edit",
        expire: 7200
      });
    }

    return createJsonResponse(200, {
      code: 0,
      msg: "ok",
      data: {
        children: [{ block_id: "blk_created" }]
      }
    });
  }

  await executeTool(
    "edit_feishu_doc",
    {
      document_id: "doxcn_doc",
      operation: "append",
      content: "追加段落"
    },
    { env: createWriteEnv(), fetchImpl }
  );

  await executeTool(
    "edit_feishu_doc",
    {
      document_id: "doxcn_doc",
      operation: "insert",
      parent_block_id: "blk_parent",
      index: 0,
      content: "插入段落"
    },
    { env: createWriteEnv(), fetchImpl }
  );

  await executeTool(
    "edit_feishu_doc",
    {
      document_id: "doxcn_doc",
      operation: "update_text",
      block_id: "blk_text",
      content: "更新后文本"
    },
    { env: createWriteEnv(), fetchImpl }
  );

  const writeRequests = requests.filter(
    (request) => !request.url.includes("tenant_access_token")
  );
  assert.equal(writeRequests[0].method, "POST");
  assert.match(writeRequests[0].url, /blocks\/doxcn_doc\/children/);
  assert.equal(JSON.parse(writeRequests[1].body).index, 0);
  assert.equal(writeRequests[2].method, "PATCH");
  assert.match(writeRequests[2].url, /blocks\/blk_text$/);
  assert.match(writeRequests[2].body, /update_text_elements/);
});

test("Drive 写入 tool 会创建文件夹并移动文件", async () => {
  const requests = [];

  async function fetchImpl(url, init) {
    requests.push({
      url: String(url),
      method: init.method,
      body: init.body
    });

    if (String(url).includes("tenant_access_token")) {
      return createJsonResponse(200, {
        code: 0,
        msg: "ok",
        tenant_access_token: "t_drive",
        expire: 7200
      });
    }

    if (String(url).endsWith("/drive/v1/files/create_folder")) {
      return createJsonResponse(200, {
        code: 0,
        msg: "ok",
        data: {
          token: "fldcn_child",
          name: "资料"
        }
      });
    }

    return createJsonResponse(200, {
      code: 0,
      msg: "ok",
      data: {
        task_id: "task_123"
      }
    });
  }

  const folder = await executeTool(
    "create_feishu_folder",
    {
      parent_folder_token: "fldcn_parent",
      name: "资料"
    },
    { env: createWriteEnv(), fetchImpl }
  );
  const moved = await executeTool(
    "move_feishu_file",
    {
      file_token: "doxcn_doc",
      file_type: "docx",
      target_folder_token: "fldcn_child"
    },
    { env: createWriteEnv(), fetchImpl }
  );

  assert.equal(folder.folder_token, "fldcn_child");
  assert.equal(moved.task_id, "task_123");
  const writeRequests = requests.filter(
    (request) => !request.url.includes("tenant_access_token")
  );
  assert.equal(
    writeRequests[0].url,
    "https://open.feishu.cn/open-apis/drive/v1/files/create_folder"
  );
  assert.deepEqual(JSON.parse(writeRequests[0].body), {
    name: "资料",
    folder_token: "fldcn_parent"
  });
  assert.match(writeRequests[1].url, /drive\/v1\/files\/doxcn_doc\/move$/);
  assert.deepEqual(JSON.parse(writeRequests[1].body), {
    type: "docx",
    folder_token: "fldcn_child"
  });
});

test("create_feishu_folder 会拒绝缺少 folder_token 的飞书响应", async () => {
  await assert.rejects(
    () =>
      executeTool(
        "create_feishu_folder",
        {
          parent_folder_token: "fldcn_parent",
          name: "资料"
        },
        {
          env: createWriteEnv(),
          fetchImpl: async (url) => {
            if (String(url).includes("tenant_access_token")) {
              return createJsonResponse(200, {
                code: 0,
                msg: "ok",
                tenant_access_token: "t_drive",
                expire: 7200
              });
            }

            return createJsonResponse(200, {
              code: 0,
              msg: "ok",
              data: {
                name: "资料"
              }
            });
          }
        }
      ),
    (error) => {
      assert.ok(error instanceof FeishuApiError);
      assert.match(error.message, /缺少 folder_token/);
      assert.equal(error.context.parent_folder_token, "fldcn_parent");
      return true;
    }
  );
});
