export async function fetchUsers() {
  const result = await fetch("https://example.com/users");
  const data: any = await result.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}

export async function fetchPosts() {
  const result = await fetch("https://example.com/posts");
  const data: any = await result.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}
