import assert from "node:assert/strict";
import test from "node:test";

import { buildIndex } from "../lib/index-store.js";
import { loadDocumentSource } from "../lib/data-source.js";
import { loadFeishuDocuments } from "../lib/feishu-docs-source.js";

function createMockFeishuClient() {
  const calls = [];

  return {
    calls,
    async request(path, options = {}) {
      calls.push({
        path,
        options
      });

      if (path === "drive/v1/files") {
        const folderToken = options.searchParams?.folder_token;

        if (folderToken === "fld_root") {
          return {
            code: 0,
            data: {
              files: [
                {
                  name: "产品文档",
                  token: "fld_child",
                  type: "folder",
                  modified_time: "1713744000"
                },
                {
                  name: "Phoenix PRD",
                  token: "dox_root",
                  type: "docx",
                  owner_id: "ou_alice",
                  modified_time: "1713873600",
                  url: "https://feishu.cn/docx/dox_root"
                },
                {
                  name: "Atlas Shortcut",
                  token: "nod_shortcut",
                  type: "shortcut",
                  shortcut_info: {
                    target_type: "docx",
                    target_token: "dox_shortcut"
                  },
                  owner_id: "ou_bob",
                  modified_time: "1713960000"
                },
                {
                  name: "Ignore Sheet",
                  token: "sht_ignore",
                  type: "sheet",
                  owner_id: "ou_sheet",
                  modified_time: "1713960000"
                }
              ],
              has_more: false
            }
          };
        }

        if (folderToken === "fld_child") {
          return {
            code: 0,
            data: {
              files: [
                {
                  name: "Nested Design",
                  token: "dox_nested",
                  type: "docx",
                  owner_id: "ou_carol",
                  modified_time: "1714046400",
                  url: "https://feishu.cn/docx/dox_nested"
                }
              ],
              has_more: false
            }
          };
        }
      }

      if (path === "wiki/v2/spaces/get_node") {
        return {
          code: 0,
          data: {
            node: {
              space_id: "space_atlas",
              node_token: "wik_root",
              obj_token: "dox_wiki_root",
              obj_type: "docx",
              title: "Atlas 知识库",
              owner: "ou_root",
              obj_edit_time: "1714132800",
              has_child: true
            }
          }
        };
      }

      if (path === "wiki/v2/spaces/space_atlas/nodes") {
        const parentToken = options.searchParams?.parent_node_token;

        if (parentToken === "wik_root") {
          return {
            code: 0,
            data: {
              items: [
                {
                  space_id: "space_atlas",
                  node_token: "wik_design",
                  obj_token: "dox_wiki_design",
                  obj_type: "docx",
                  title: "设计方案",
                  owner: "ou_design",
                  obj_edit_time: "1714219200",
                  has_child: false
                },
                {
                  space_id: "space_atlas",
                  node_token: "wik_section",
                  obj_token: "sht_skip",
                  obj_type: "sheet",
                  title: "子目录",
                  owner: "ou_section",
                  obj_edit_time: "1714219200",
                  has_child: true
                }
              ],
              has_more: false
            }
          };
        }

        if (parentToken === "wik_section") {
          return {
            code: 0,
            data: {
              items: [
                {
                  space_id: "space_atlas",
                  node_token: "wik_retro",
                  obj_token: "dox_wiki_retro",
                  obj_type: "docx",
                  title: "上线复盘",
                  owner: "ou_retro",
                  obj_edit_time: "1714305600",
                  has_child: false
                }
              ],
              has_more: false
            }
          };
        }
      }

      if (path === "docx/v1/documents/dox_root/raw_content") {
        return {
          code: 0,
          data: {
            content: "Phoenix App 在 2026Q2 聚焦增长漏斗优化。"
          }
        };
      }

      if (path === "docx/v1/documents/dox_shortcut/raw_content") {
        return {
          code: 0,
          data: {
            content: "Atlas 平台提供自动同步链路。"
          }
        };
      }

      if (path === "docx/v1/documents/dox_nested/raw_content") {
        return {
          code: 0,
          data: {
            content: "Nested Design for Atlas 平台。"
          }
        };
      }

      if (path === "docx/v1/documents/dox_wiki_root/raw_content") {
        return {
          code: 0,
          data: {
            content: "Atlas 知识库首页正文。"
          }
        };
      }

      if (path === "docx/v1/documents/dox_wiki_design/raw_content") {
        return {
          code: 0,
          data: {
            content: "设计方案正文。"
          }
        };
      }

      if (path === "docx/v1/documents/dox_wiki_retro/raw_content") {
        return {
          code: 0,
          data: {
            content: "上线复盘正文。"
          }
        };
      }

      throw new Error(`unexpected request: ${path}`);
    }
  };
}

test("loadFeishuDocuments 会递归遍历 folder 与 wiki 根入口并归一化 docx", async () => {
  const client = createMockFeishuClient();
  const documents = await loadFeishuDocuments({
    client,
    syncRoots: [
      { type: "folder", token: "fld_root" },
      { type: "wiki", token: "wik_root" }
    ]
  });

  assert.equal(documents.length, 6);
  assert.equal(documents[0].doc_id, "dox_wiki_retro");

  const nestedFolderDoc = documents.find((item) => item.doc_id === "dox_nested");
  assert.equal(
    nestedFolderDoc.source_path,
    "folder:fld_root/产品文档/Nested Design"
  );
  assert.equal(nestedFolderDoc.url, "https://feishu.cn/docx/dox_nested");
  assert.equal(nestedFolderDoc.revisions.length, 1);

  const wikiRootDoc = documents.find((item) => item.doc_id === "dox_wiki_root");
  assert.equal(wikiRootDoc.url, "https://feishu.cn/wiki/wik_root");
  assert.equal(wikiRootDoc.source_path, "Atlas 知识库");

  const wikiChildDoc = documents.find((item) => item.doc_id === "dox_wiki_retro");
  assert.equal(
    wikiChildDoc.source_path,
    "Atlas 知识库/子目录/上线复盘"
  );

  assert.ok(
    client.calls.some((call) => call.path === "wiki/v2/spaces/space_atlas/nodes")
  );
  assert.ok(
    client.calls.some(
      (call) => call.path === "docx/v1/documents/dox_shortcut/raw_content"
    )
  );
});

test("loadDocumentSource 在 feishu 模式下会输出当前索引兼容结构", async () => {
  const client = createMockFeishuClient();
  const sourceData = await loadDocumentSource(
    {
      sourceType: "feishu",
      appId: "cli_test",
      appSecret: "secret_test",
      syncRoots: [{ type: "folder", token: "fld_root" }],
      feishuClient: client
    },
    {}
  );

  assert.equal(sourceData.sourceType, "feishu");
  assert.ok(sourceData.projects.length > 0);
  assert.ok(sourceData.docTypes.length > 0);
  assert.equal(sourceData.documents.length, 3);

  const index = buildIndex(sourceData);
  const target = index.documents.find((item) => item.doc_id === "dox_shortcut");

  assert.equal(index.source_type, "feishu");
  assert.equal(target.title, "Atlas Shortcut");
  assert.ok(target.summary.includes("Atlas"));
});
