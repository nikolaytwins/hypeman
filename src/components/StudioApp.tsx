"use client";

import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { nanoid } from "nanoid";
import {
  ArrowLeft,
  Clapperboard,
  Film,
  Loader2,
  Mic2,
  Sparkles,
  Subtitles,
  Upload,
  Wand2,
  Download,
  ChevronRight,
  LayoutGrid,
  PenLine,
  FileVideo2,
  Captions,
  ListTree,
  Layers,
  Combine,
  PartyPopper,
  ScrollText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  bentoBox,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import type { ScriptPayload } from "@/lib/pipeline/types";
import { cn } from "@/lib/utils";

type LogEntry = { t: string; level: "info" | "error"; msg: string };
type Origin = "new" | "adapt";
type Screen =
  | "pick"
  | "new_topic"
  | "new_script"
  | "adapt_upload"
  | "adapt_transcribe"
  | "adapt_rewrite"
  | "voice"
  | "scenes"
  | "render"
  | "done";

const ERR_REQUEST = "Ошибка запроса";
const ERR_UPLOAD = "Ошибка загрузки";

function formatTime() {
  return new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function StepHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-violet-200/90 bg-gradient-to-br from-violet-100 to-fuchsia-50 text-violet-700 shadow-sm">
        <Icon className="h-5 w-5 text-violet-700" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
        {description ? <p className="text-sm leading-relaxed text-slate-500">{description}</p> : null}
      </div>
    </div>
  );
}

export function StudioApp() {
  const [jobId, setJobId] = useState(() => nanoid(10));
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [screen, setScreen] = useState<Screen>("pick");
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState<ScriptPayload | null>(null);
  const [transcript, setTranscript] = useState("");
  const [sceneFileNames, setSceneFileNames] = useState<string[]>([]);
  const [sourceReady, setSourceReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [errOpen, setErrOpen] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [renderProgress, setRenderProgress] = useState(0);
  const scenesInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);

  const pushLog = useCallback((msg: string, level: LogEntry["level"] = "info") => {
    setLogs((prev) => [...prev.slice(-60), { t: formatTime(), level, msg }]);
  }, []);

  const fail = useCallback(
    (e: unknown) => {
      const m = e instanceof Error ? e.message : String(e);
      setErrMsg(m);
      setErrOpen(true);
      pushLog(m, "error");
    },
    [pushLog],
  );

  const resetAll = () => {
    setJobId(nanoid(10));
    setOrigin(null);
    setScreen("pick");
    setTopic("");
    setScript(null);
    setTranscript("");
    setSceneFileNames([]);
    setSourceReady(false);
    setLogs([]);
    setRenderProgress(0);
    pushLog("Новая задача");
  };

  const goBack = () => {
    switch (screen) {
      case "new_topic":
        setScreen("pick");
        setOrigin(null);
        break;
      case "new_script":
        setScreen(origin === "adapt" ? "adapt_rewrite" : "new_topic");
        break;
      case "adapt_upload":
        setScreen("pick");
        setOrigin(null);
        break;
      case "adapt_transcribe":
        setScreen("adapt_upload");
        break;
      case "adapt_rewrite":
        setScreen("adapt_transcribe");
        break;
      case "voice":
        setScreen("new_script");
        break;
      case "scenes":
        setScreen("voice");
        break;
      case "render":
        setScreen("scenes");
        break;
      case "done":
        setRenderProgress(0);
        setScreen("render");
        break;
      default:
        break;
    }
  };

  const canGoBack =
    screen !== "pick" &&
    screen !== "done" &&
    !(screen === "render" && renderProgress > 0 && busy);

  const stepProgress = useMemo(() => {
    if (screen === "new_script" && origin === "adapt") return 40;
    const map: Record<Screen, number> = {
      pick: 0,
      new_topic: 12,
      new_script: 28,
      adapt_upload: 12,
      adapt_transcribe: 22,
      adapt_rewrite: 32,
      voice: 50,
      scenes: 72,
      render: 88,
      done: 100,
    };
    return map[screen] ?? 0;
  }, [screen, origin]);

  const onGenerateScript = async () => {
    setBusy("Генерация сценария");
    pushLog("Генерация сценария…");
    try {
      const res = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? ERR_REQUEST);
      setScript(data.script as ScriptPayload);
      pushLog("Сценарий готов");
      setScreen("new_script");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const onAdapt = async () => {
    setBusy("Адаптация сценария");
    pushLog("Адаптация сценария…");
    try {
      const res = await fetch("/api/adapt-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? ERR_REQUEST);
      setScript(data.script as ScriptPayload);
      pushLog("Адаптированный сценарий готов");
      setScreen("new_script");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const onExtractAndTranscribe = async () => {
    setBusy("Аудио и расшифровка");
    pushLog("Извлечение аудио…");
    try {
      const r1 = await fetch("/api/extract-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const d1 = await r1.json();
      if (!r1.ok) throw new Error(d1.error ?? ERR_REQUEST);
      pushLog("Расшифровка Whisper…");
      const r2 = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, audioFileName: "extracted.mp3" }),
      });
      const d2 = await r2.json();
      if (!r2.ok) throw new Error(d2.error ?? ERR_REQUEST);
      setTranscript(String(d2.transcript ?? ""));
      pushLog("Расшифровка готова");
      setScreen("adapt_rewrite");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const onVoice = async () => {
    if (!script) return;
    setBusy("Озвучка");
    pushLog("Генерация озвучки…");
    try {
      const res = await fetch("/api/generate-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, script }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? ERR_REQUEST);
      pushLog("voice.mp3 сохранён");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const uploadScenes = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("Загрузка сцен");
    try {
      const fd = new FormData();
      fd.set("jobId", jobId);
      for (const f of Array.from(files)) fd.append("files", f);
      const res = await fetch("/api/upload/scenes", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? ERR_UPLOAD);
      setSceneFileNames(data.sceneFileNames as string[]);
      pushLog(`Загружено сцен: ${(data.sceneFileNames as string[]).length}`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const uploadSource = async (files: FileList | null) => {
    if (!files?.[0]) return;
    setBusy("Загрузка видео");
    try {
      const fd = new FormData();
      fd.set("jobId", jobId);
      fd.set("file", files[0]);
      const res = await fetch("/api/upload/source", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? ERR_UPLOAD);
      setSourceReady(true);
      pushLog("Исходное видео сохранено");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const runAssemble = async () => {
    setBusy("Сборка");
    setRenderProgress(5);
    const steps = [
      { pct: 25, fn: async () => {
        const res = await fetch("/api/merge-videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            sceneFileNames,
            sceneDurationsSec: script?.scenes.map((s) => s.durationHintSec),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? ERR_REQUEST);
        pushLog("Сцены склеены");
      }},
      { pct: 50, fn: async () => {
        const res = await fetch("/api/add-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? ERR_REQUEST);
        pushLog("Озвучка наложена");
      }},
      { pct: 75, fn: async () => {
        const res = await fetch("/api/generate-subtitles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? ERR_REQUEST);
        pushLog("Субтитры SRT готовы");
      }},
      { pct: 100, fn: async () => {
        const res = await fetch("/api/burn-subtitles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? ERR_REQUEST);
        pushLog("Финальный MP4 готов");
      }},
    ];
    try {
      pushLog("Запуск конвейера ffmpeg…");
      for (const s of steps) {
        await s.fn();
        setRenderProgress(s.pct);
      }
      setScreen("done");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const preventDragDefaults = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const updateSceneText = (id: number, narration: string) => {
    setScript((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scenes: prev.scenes.map((s) => (s.id === id ? { ...s, narration } : s)),
      };
    });
  };

  const updateSceneVisual = (id: number, visualHint: string) => {
    setScript((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scenes: prev.scenes.map((s) => (s.id === id ? { ...s, visualHint } : s)),
      };
    });
  };

  const voiceUrl = `/api/download/${jobId}/voice.mp3`;
  const finalUrl = `/api/download/${jobId}/final.mp4`;

  const screenTitle: Record<Screen, string> = {
    pick: "Начало",
    new_topic: "Тема ролика",
    new_script: "Сценарий",
    adapt_upload: "Исходный ролик",
    adapt_transcribe: "Аудио и текст",
    adapt_rewrite: "Адаптация",
    voice: "Озвучка",
    scenes: "Видеосцены",
    render: "Сборка",
    done: "Готово",
  };

  const dropZoneClass =
    "flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/40 py-10 transition duration-300 hover:border-violet-300 hover:shadow-[0_0_36px_-12px_rgba(124,58,237,0.15)]";

  return (
    <div className="relative z-10 mx-auto min-h-full w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <div className="grid grid-cols-12 gap-4 lg:gap-5">
        <header
          className={cn(
            "col-span-12 space-y-3 pb-2",
            screen === "pick" && "flex flex-col items-center text-center",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2",
              screen === "pick" && "justify-center",
            )}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-200/80 bg-white/80 text-violet-700 shadow-sm backdrop-blur-md">
              <LayoutGrid className="h-4 w-4" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Hypeman</p>
          </div>
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Контент-ассистент
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-slate-600">
            Один шаг на экране: сценарий с ИИ, озвучка, ffmpeg и субтитры — в светлых карточках без лишнего шума.
          </p>
        </header>

        {screen !== "pick" ? (
          <Card className="col-span-12 p-4 lg:col-span-12">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-[0_0_8px_rgba(124,58,237,0.35)]" />
                <span className="tracking-tight">{screenTitle[screen]}</span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">{jobId}</span>
            </div>
            <div className="mt-3">
              <Progress value={stepProgress} />
            </div>
          </Card>
        ) : null}

        <div
          className={cn(
            "col-span-12 w-full",
            screen === "pick" ? "mx-auto max-w-xl sm:max-w-2xl" : "lg:col-span-8",
          )}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={screen}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              {screen === "pick" ? (
                <Card>
                  <CardHeader>
                    <StepHeader
                      icon={LayoutGrid}
                      title="Что делаем?"
                      description="Выберите поток — дальше по одному шагу в фокусе."
                    />
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
                      <Button
                        variant="secondary"
                        className="h-full min-h-[140px] w-full flex-col items-stretch justify-between gap-4 rounded-xl border border-slate-200/90 bg-white/70 p-5 text-left shadow-sm backdrop-blur-xl transition hover:border-violet-200 hover:shadow-[0_16px_40px_-16px_rgba(124,58,237,0.2)]"
                        onClick={() => {
                          setOrigin("new");
                          setScript(null);
                          setTranscript("");
                          setSceneFileNames([]);
                          setSourceReady(false);
                          setTopic("");
                          setRenderProgress(0);
                          setScreen("new_topic");
                        }}
                      >
                        <Clapperboard className="h-6 w-6 text-violet-600" />
                        <span>
                          <span className="block text-base font-medium tracking-tight text-slate-900">
                            Новый ролик
                          </span>
                          <span className="mt-1 block text-xs font-normal text-slate-500">
                            Тема → сценарий → озвучка → сцены → финал
                          </span>
                        </span>
                        <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
                      </Button>
                    </motion.div>
                    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
                      <Button
                        variant="secondary"
                        className="h-full min-h-[140px] w-full flex-col items-stretch justify-between gap-4 rounded-xl border border-slate-200/90 bg-white/70 p-5 text-left shadow-sm backdrop-blur-xl transition hover:border-fuchsia-200 hover:shadow-[0_16px_40px_-16px_rgba(192,38,211,0.18)]"
                        onClick={() => {
                          setOrigin("adapt");
                          setScript(null);
                          setTranscript("");
                          setSceneFileNames([]);
                          setSourceReady(false);
                          setRenderProgress(0);
                          setScreen("adapt_upload");
                        }}
                      >
                        <Film className="h-6 w-6 text-fuchsia-600" />
                        <span>
                          <span className="block text-base font-medium tracking-tight text-slate-900">
                            Адаптировать ролик
                          </span>
                          <span className="mt-1 block text-xs font-normal text-slate-500">
                            Загрузка → звук и текст → новый сценарий → финал
                          </span>
                        </span>
                        <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
                      </Button>
                    </motion.div>
                  </CardContent>
                </Card>
              ) : null}

              {screen === "new_topic" ? (
                <Card>
                  <CardHeader>
                    <StepHeader icon={PenLine} title="Шаг 1 · Тема" description="Кратко опишите, о чём ролик." />
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <Textarea
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="Например: три ошибки в оформлении Stories, из-за которых вас листают…"
                      className="min-h-[132px]"
                    />
                    <Button
                      variant="gloss"
                      className="w-full"
                      disabled={!!busy || !topic.trim()}
                      onClick={onGenerateScript}
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Сгенерировать сценарий
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {screen === "new_script" && script ? (
                <Card>
                  <CardHeader>
                    <StepHeader
                      icon={ListTree}
                      title={
                        origin === "adapt"
                          ? "Шаг 4 · Сценарий и промпты кадров"
                          : "Шаг 2 · Сценарий"
                      }
                      description={
                        origin === "adapt"
                          ? "Озвучка на русском, промпты для генерации картинок — на английском. Порядок сцен = порядок кадров в монтаже."
                          : "Отредактируйте текст по сценам; промпты — для картинок под каждую сцену."
                      }
                    />
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm text-slate-700">
                      <span className="font-medium text-violet-900">Визуалов нужно: {script.scenes.length}</span>
                      <span className="text-slate-600">
                        {" "}
                        — столько файлов загрузите на шаге «Сцены» (картинки или короткие видео, в том же порядке).
                      </span>
                    </div>
                    <div className="max-h-[min(52vh,400px)] space-y-3 overflow-y-auto pr-1">
                      {script.scenes.map((s) => (
                        <div key={s.id} className={cn(bentoBox, "space-y-3 p-4")}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            Сцена {s.id} · ~{s.durationHintSec} с
                          </p>
                          <div>
                            <Label className="normal-case tracking-normal text-slate-600">Озвучка</Label>
                            <Textarea
                              value={s.narration}
                              onChange={(e) => updateSceneText(s.id, e.target.value)}
                              className="mt-2 min-h-[80px] text-sm"
                            />
                          </div>
                          <div>
                            <Label className="normal-case tracking-normal text-slate-600">
                              Промпт для изображения (EN)
                            </Label>
                            <Textarea
                              value={s.visualHint ?? ""}
                              onChange={(e) => updateSceneVisual(s.id, e.target.value)}
                              placeholder="e.g. cinematic close-up, soft window light, 35mm…"
                              className="mt-2 min-h-[72px] font-mono text-xs"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button variant="gloss" className="w-full" onClick={() => setScreen("voice")}>
                      Далее: озвучка
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {screen === "adapt_upload" ? (
                <Card>
                  <CardHeader>
                    <StepHeader
                      icon={FileVideo2}
                      title="Шаг 1 · Загрузка"
                      description="TikTok / Reel / вертикальное видео."
                    />
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <input
                      ref={sourceInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => uploadSource(e.target.files)}
                    />
                    <button
                      type="button"
                      onClick={() => sourceInputRef.current?.click()}
                      onDragEnter={preventDragDefaults}
                      onDragOver={preventDragDefaults}
                      onDrop={(e) => {
                        preventDragDefaults(e);
                        uploadSource(e.dataTransfer.files);
                      }}
                      className={dropZoneClass}
                    >
                      <Upload className="h-8 w-8 text-slate-400" />
                      <span className="text-sm text-slate-600">Перетащите или нажмите</span>
                      {sourceReady ? (
                        <span className="text-xs text-emerald-400/90">Файл принят</span>
                      ) : null}
                    </button>
                    <Button
                      variant="gloss"
                      className="w-full"
                      disabled={!sourceReady || !!busy}
                      onClick={() => setScreen("adapt_transcribe")}
                    >
                      Далее
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {screen === "adapt_transcribe" ? (
                <Card>
                  <CardHeader>
                    <StepHeader
                      icon={Captions}
                      title="Шаг 2 · Звук и текст"
                      description="Один запуск: извлечение дорожки и расшифровка."
                    />
                  </CardHeader>
                  <CardContent>
                    <Button variant="gloss" className="w-full" disabled={!!busy} onClick={onExtractAndTranscribe}>
                      {busy ? <Loader2 className="animate-spin" /> : <Mic2 className="h-4 w-4" />}
                      Извлечь аудио и расшифровать
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {screen === "adapt_rewrite" ? (
                <Card>
                  <CardHeader>
                    <StepHeader
                      icon={ScrollText}
                      title="Шаг 3 · Новый сценарий"
                      description="Проверьте текст и запустите адаптацию под ваш бренд."
                    />
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div>
                      <Label>Расшифровка</Label>
                      <Textarea
                        value={transcript}
                        onChange={(e) => setTranscript(e.target.value)}
                        className="mt-2 min-h-[168px] font-mono text-xs"
                      />
                    </div>
                    <Button variant="gloss" className="w-full" disabled={!!busy || !transcript.trim()} onClick={onAdapt}>
                      {busy ? <Loader2 className="animate-spin" /> : <Wand2 className="h-4 w-4" />}
                      Адаптировать (Gemini)
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {screen === "voice" && script ? (
                <Card>
                  <CardHeader>
                    <StepHeader
                      icon={Sparkles}
                      title={`${origin === "adapt" ? "Шаг 5" : "Шаг 3"} · Озвучка`}
                      description="ElevenLabs → voice.mp3 для этой задачи."
                    />
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <Button variant="gloss" className="w-full" disabled={!!busy} onClick={onVoice}>
                      {busy ? <Loader2 className="animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Сгенерировать озвучку
                    </Button>
                    <audio
                      controls
                      className="w-full rounded-xl border border-slate-200 bg-white p-2"
                      src={voiceUrl}
                    />
                    <Button variant="secondary" className="w-full" onClick={() => setScreen("scenes")}>
                      Далее: видеосцены
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {screen === "scenes" ? (
                <Card>
                  <CardHeader>
                    <StepHeader
                      icon={Layers}
                      title={`${origin === "adapt" ? "Шаг 6" : "Шаг 4"} · Сцены`}
                      description="Порядок файлов = порядок в таймлайне. Картинки растягиваются на длительность сцены из сценария; видео — как есть."
                    />
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <input
                      ref={scenesInputRef}
                      type="file"
                      accept="video/*,image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => uploadScenes(e.target.files)}
                    />
                    <button
                      type="button"
                      onClick={() => scenesInputRef.current?.click()}
                      onDragEnter={preventDragDefaults}
                      onDragOver={preventDragDefaults}
                      onDrop={(e) => {
                        preventDragDefaults(e);
                        uploadScenes(e.dataTransfer.files);
                      }}
                      className={cn(dropZoneClass, "py-12")}
                    >
                      <Upload className="h-8 w-8 text-slate-400" />
                      <span className="text-sm text-slate-600">
                        {sceneFileNames.length
                          ? `${sceneFileNames.length} файл(ов)`
                          : "Загрузите картинки или видео по сценам"}
                      </span>
                    </button>
                    <Button
                      variant="gloss"
                      className="w-full"
                      disabled={!sceneFileNames.length || !!busy}
                      onClick={() => {
                        setRenderProgress(0);
                        setScreen("render");
                      }}
                    >
                      Далее: сборка
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {screen === "render" ? (
                <Card>
                  <CardHeader>
                    <StepHeader
                      icon={Combine}
                      title={`${origin === "adapt" ? "Шаг 7" : "Шаг 5"} · Финал`}
                      description="Склейка, озвучка, субтитры и прожиг — одной кнопкой."
                    />
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {renderProgress > 0 && renderProgress < 100 ? <Progress value={renderProgress} /> : null}
                    <Button variant="gloss" className="w-full" disabled={!!busy} onClick={runAssemble}>
                      {busy ? <Loader2 className="animate-spin" /> : <Subtitles className="h-4 w-4" />}
                      Собрать final.mp4
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {screen === "done" ? (
                <Card>
                  <CardHeader>
                    <StepHeader icon={PartyPopper} title="Готово" description="Файл в папке output этой задачи." />
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <Button variant="gloss" asChild>
                      <a href={finalUrl} download>
                        <Download className="h-4 w-4" />
                        Скачать final.mp4
                      </a>
                    </Button>
                    <Button variant="secondary" onClick={resetAll}>
                      Новый проект
                    </Button>
                  </CardContent>
                </Card>
              ) : null}
            </motion.div>
          </AnimatePresence>

          {screen !== "pick" && canGoBack ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-4 text-slate-500 hover:text-slate-800"
              onClick={goBack}
            >
              <ArrowLeft className="h-4 w-4" />
              Назад
            </Button>
          ) : null}
        </div>

        {screen !== "pick" ? (
          <aside className="col-span-12 lg:col-span-4 lg:sticky lg:top-8 lg:self-start">
            <Card className="min-h-[200px]">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-200/80 bg-white text-violet-700 shadow-sm">
                    <ScrollText className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Журнал</CardTitle>
                    <CardDescription className="text-xs">События конвейера</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="max-h-[min(40vh,320px)] overflow-y-auto pt-0 font-mono text-[10px] leading-relaxed text-slate-500">
                {logs.length === 0 ? <span className="text-slate-400">Пока пусто</span> : null}
                {logs.map((l, i) => (
                  <div key={`${l.t}-${i}`} className={l.level === "error" ? "text-red-600" : ""}>
                    <span className="text-slate-400">[{l.t}]</span> {l.msg}
                  </div>
                ))}
              </CardContent>
            </Card>
          </aside>
        ) : null}
      </div>

      <Dialog open={errOpen} onOpenChange={setErrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ошибка</DialogTitle>
            <DialogDescription className="font-mono text-xs text-red-400/90">{errMsg}</DialogDescription>
          </DialogHeader>
          <Button variant="secondary" onClick={() => setErrOpen(false)}>
            Закрыть
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
