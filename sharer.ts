import { requestUrl, RequestUrlParam } from 'obsidian';

export const shareNote = (key: string, content: string, permission: { writePermission: String, readPermission: String, commentPermission: String }) => {
  const data = JSON.stringify({
    "content": content,
    "writePermission": permission.writePermission,
    "commentPermission": permission.commentPermission,
    "readPermission": permission.readPermission
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

export const updataNote = (key: string, content: string, id: string) => {
  const data = JSON.stringify({
    "content": content,
  });

  const requestParams: RequestUrlParam = {
    method: 'patch',
    url: 'https://api.hackmd.io/v1/notes/' + id,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': "Bearer " + key,
      'Cookie': 'locale=dev',
    },
    body: data
  };
  return requestUrl(requestParams)
}

export const getNote = (key: string, id: string) => {
  const requestParams: RequestUrlParam = {
    method: 'get',
    url: 'https://api.hackmd.io/v1/notes/' + id,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': "Bearer " + key,
      'Cookie': 'locale=dev',
    },
  };

  return requestUrl(requestParams)
}