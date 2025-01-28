import { requestUrl, RequestUrlParam } from 'obsidian';

export const share = (key: string, content: string, writePermission = "owner") => {
  const data = JSON.stringify({
    "content": content,
    "commentPermission": "everyone",
    "readPermission": "guest",
    "writePermission": writePermission
  });
  
  const requestParams: RequestUrlParam = {
    method: 'post',
    url: 'https://api.hackmd.io/v1/notes',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': "Bearer " + key,
      'Cookie': 'locale=dev',
    },
    body: data
  };
  return requestUrl(requestParams)
}