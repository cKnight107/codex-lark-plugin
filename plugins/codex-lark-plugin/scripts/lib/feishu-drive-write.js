import { FeishuApiError } from "./feishu-client.js";

const createFolderPath = "drive/v1/files/create_folder";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createFolderUrl(folderToken) {
  return `https://feishu.cn/drive/folder/${folderToken}`;
}

function extractFolder(response, name, parentFolderToken) {
  const data = response.data ?? {};
  const folder = data.folder ?? data;
  const folderToken =
    normalizeText(folder.folder_token) ||
    normalizeText(folder.token) ||
    normalizeText(data.folder_token) ||
    normalizeText(data.token);

  if (!folderToken) {
    throw new FeishuApiError("飞书创建文件夹响应缺少 folder_token。", {
      requestPath: createFolderPath,
      requestMethod: "POST",
      context: {
        parent_folder_token: parentFolderToken
      },
      details: response
    });
  }

  return {
    folder_token: folderToken,
    name: normalizeText(folder.name) || name,
    parent_folder_token: parentFolderToken,
    url: normalizeText(folder.url) || (folderToken ? createFolderUrl(folderToken) : "")
  };
}

export async function createFeishuFolder({ client, args }) {
  const response = await client.request(createFolderPath, {
    method: "POST",
    body: {
      name: args.name,
      folder_token: args.parent_folder_token
    },
    context: {
      parent_folder_token: args.parent_folder_token
    }
  });

  return extractFolder(response, args.name, args.parent_folder_token);
}

export async function moveFeishuFile({ client, args }) {
  const response = await client.request(
    `drive/v1/files/${args.file_token}/move`,
    {
      method: "POST",
      body: {
        type: args.file_type,
        folder_token: args.target_folder_token
      },
      context: {
        file_token: args.file_token,
        file_type: args.file_type,
        target_folder_token: args.target_folder_token
      }
    }
  );

  return {
    file_token: args.file_token,
    file_type: args.file_type,
    target_folder_token: args.target_folder_token,
    task_id: normalizeText(response.data?.task_id),
    response: response.data ?? {}
  };
}
