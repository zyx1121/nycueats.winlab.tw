import type { SupabaseClient } from "@supabase/supabase-js";

const HSINCHU_LAT = 24.78;
const HSINCHU_LON = 121.00;
const WEATHER_CACHE_S = 1800;

type Ctx = { hourBand: "morning" | "noon" | "afternoon" | "evening" | "night"; tempBand: "cold" | "mild" | "hot"; rainy: boolean };

function bandHour(hour: number): Ctx["hourBand"] {
  if (hour < 5)  return "night";
  if (hour < 10) return "morning";
  if (hour < 14) return "noon";
  if (hour < 18) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}

function bandTemp(tempC: number): Ctx["tempBand"] {
  if (tempC < 18) return "cold";
  if (tempC < 28) return "mild";
  return "hot";
}

const PHRASES: Record<string, string> = {
  morning_cold_dry:    "chilly morning, warm breakfast and hot drinks",
  morning_cold_rain:   "rainy cold morning, warm hearty breakfast soup",
  morning_mild_dry:    "fresh morning, light breakfast",
  morning_mild_rain:   "rainy morning, comforting warm breakfast",
  morning_hot_dry:     "warm morning, light cool breakfast",
  morning_hot_rain:    "humid rainy morning, warm light breakfast",
  noon_cold_dry:       "cold noon, warm hearty lunch and soup",
  noon_cold_rain:      "rainy cold noon, hot soup and comfort food",
  noon_mild_dry:       "mild noon, satisfying lunch",
  noon_mild_rain:      "rainy mild noon, warm comfort lunch",
  noon_hot_dry:        "scorching hot noon, cold drinks ice light meal",
  noon_hot_rain:       "humid hot noon, cool light lunch",
  afternoon_cold_dry:  "chilly afternoon, hot drink and snack",
  afternoon_cold_rain: "rainy cold afternoon, hot tea warm snack",
  afternoon_mild_dry:  "calm afternoon, light snack drink",
  afternoon_mild_rain: "rainy afternoon, warm drink",
  afternoon_hot_dry:   "hot afternoon, cold drinks shaved ice",
  afternoon_hot_rain:  "humid afternoon, cool refreshing drink",
  evening_cold_dry:    "cold evening, hot hearty dinner",
  evening_cold_rain:   "rainy cold evening, hot pot and warm soup",
  evening_mild_dry:    "pleasant evening dinner",
  evening_mild_rain:   "rainy evening, warm comfort dinner",
  evening_hot_dry:     "hot evening, light refreshing dinner cold drinks",
  evening_hot_rain:    "humid evening, cool light dinner",
  night_cold_dry:      "cold late night, warm small bite",
  night_cold_rain:     "rainy cold night, hot soup midnight snack",
  night_mild_dry:      "late night light bite",
  night_mild_rain:     "rainy late night, warm snack",
  night_hot_dry:       "hot late night, cold drink",
  night_hot_rain:      "humid late night, cool snack",
};

export async function getCurrentContext(): Promise<Ctx | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${HSINCHU_LAT}&longitude=${HSINCHU_LON}&current=temperature_2m,precipitation&timezone=Asia%2FTaipei`;
    const res = await fetch(url, { next: { revalidate: WEATHER_CACHE_S } });
    if (!res.ok) return null;
    const data = await res.json() as { current?: { temperature_2m?: number; precipitation?: number; time?: string } };
    const cur = data.current;
    if (!cur || typeof cur.temperature_2m !== "number") return null;
    const hour = cur.time ? new Date(cur.time).getHours() : new Date().getHours();
    return {
      hourBand: bandHour(hour),
      tempBand: bandTemp(cur.temperature_2m),
      rainy: (cur.precipitation ?? 0) > 0.1,
    };
  } catch {
    return null;
  }
}

export function contextKey(ctx: Ctx): string {
  return `${ctx.hourBand}_${ctx.tempBand}_${ctx.rainy ? "rain" : "dry"}`;
}

export async function getContextEmbedding(
  supabase: SupabaseClient,
  ctx: Ctx,
): Promise<number[] | null> {
  const key = contextKey(ctx);

  const { data: cached } = await supabase
    .from("context_embeddings")
    .select("embedding")
    .eq("key", key)
    .maybeSingle();
  if (cached?.embedding) {
    return typeof cached.embedding === "string"
      ? JSON.parse(cached.embedding)
      : (cached.embedding as number[]);
  }

  const phrase = PHRASES[key];
  if (!phrase) return null;

  try {
    const { data: embedRes, error } = await supabase.functions.invoke<{ embedding: number[] }>(
      "embed-query",
      { body: { query: phrase } },
    );
    if (error || !embedRes?.embedding) return null;

    await supabase
      .from("context_embeddings")
      .upsert({ key, embedding: embedRes.embedding as unknown as string }, { onConflict: "key" });

    return embedRes.embedding;
  } catch {
    return null;
  }
}
