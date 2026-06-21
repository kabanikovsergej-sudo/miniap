import { getApiBase, fetchMe } from "@/lib/auth";

export async function sendToNovaAI(message: string): Promise<string> {
  const me = await fetchMe();
  const token = me?.token;

  if (!token) {
    throw new Error("NO_AUTH");
  }

  const res = await fetch(`${getApiBase()}/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: message }],
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "AI_FAILED");
  }

  return data.reply;
}
