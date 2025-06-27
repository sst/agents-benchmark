async function fetchData(url: string) {
  const result = await fetch(url);
  const data: any = await result.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}

export async function fetchUsers() {
  return fetchData("https://example.com/users");
}

export async function fetchPosts() {
  return fetchData("https://example.com/posts");
}
