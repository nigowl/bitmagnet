"use client";

import { type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { ActionIcon, Button, ScrollArea, Stack, Tabs, Text, Tooltip, Group, Modal } from "@mantine/core";
import { ExternalLink, Trash2, Upload, X, Minus, Plus } from "lucide-react";
import { type PlayerSubtitleItem } from "@/lib/media-api";
import * as player from "./torrent-player/torrent-player-helpers";

type SubtitleStylePreset = player.SubtitleStylePreset;
type DiagnosticEntry = player.DiagnosticEntry;
type PlayerSubtitleSiteLink = player.PlayerSubtitleSiteLink;

type TorrentPlayerOverlaysProps = {
  scope?: "all" | "stage" | "global";
  t: (key: string) => string;
  formatClock: (seconds: number) => string;
  formatSubtitleOffsetLabel: (seconds: number) => string;
  subtitleManagerOpened: boolean;
  subtitleManagerTab: string | null;
  setSubtitleManagerOpened: Dispatch<SetStateAction<boolean>>;
  setSubtitleManagerTab: Dispatch<SetStateAction<string | null>>;
  subtitleItems: PlayerSubtitleItem[];
  subtitleSiteLinks: PlayerSubtitleSiteLink[];
  subtitleLoading: boolean;
  subtitleUploadInputRef: MutableRefObject<HTMLInputElement | null>;
  onSubtitleUploadPick: (file: File) => void;
  onAdjustSubtitleOffset: (id: number, deltaSeconds: number) => void;
  onDeleteSubtitle: (id: number) => void;
  subtitleStylePreset: SubtitleStylePreset;
  setSubtitleStylePreset: Dispatch<SetStateAction<SubtitleStylePreset>>;
  subtitleScaleOptions: readonly number[];
  resumePromptOpened: boolean;
  resumePromptSeconds: number;
  onResumePromptRestart: () => void;
  onResumePromptContinue: () => Promise<void>;
  diagnosticsOpened: boolean;
  diagnostics: DiagnosticEntry[];
  setDiagnostics: Dispatch<SetStateAction<DiagnosticEntry[]>>;
  onCopyLogs: () => Promise<void>;
  onCloseDiagnostics: () => void;
};

export function TorrentPlayerOverlays(props: TorrentPlayerOverlaysProps) {
  const {
    scope = "all",
    t,
    formatClock,
    formatSubtitleOffsetLabel,
    subtitleManagerOpened,
    subtitleManagerTab,
    setSubtitleManagerOpened,
    setSubtitleManagerTab,
    subtitleItems,
    subtitleSiteLinks,
    subtitleLoading,
    subtitleUploadInputRef,
    onSubtitleUploadPick,
    onAdjustSubtitleOffset,
    onDeleteSubtitle,
    subtitleStylePreset,
    setSubtitleStylePreset,
    subtitleScaleOptions,
    resumePromptOpened,
    resumePromptSeconds,
    onResumePromptRestart,
    onResumePromptContinue,
    diagnosticsOpened,
    diagnostics,
    setDiagnostics,
    onCopyLogs,
    onCloseDiagnostics
  } = props;

  const subtitleManagerPanel = subtitleManagerOpened ? (
    <div
      className="torrent-player-floating-panel torrent-player-subtitle-panel"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="torrent-player-panel-header">
        <div className="torrent-player-panel-title">{t("media.player.subtitleManagerTitle")}</div>
        <button
          type="button"
          className="torrent-inline-title-icon-btn"
          onClick={() => setSubtitleManagerOpened(false)}
          aria-label={t("common.close")}
        >
          <X size={14} />
        </button>
      </div>
      <div className="torrent-player-panel-scroll">
        <Tabs value={subtitleManagerTab} onChange={setSubtitleManagerTab} className="torrent-player-panel-tabs">
          <Tabs.List>
            <Tabs.Tab value="files">{t("media.player.subtitleManagerTabFiles")}</Tabs.Tab>
            <Tabs.Tab value="style">{t("media.player.subtitleManagerTabStyle")}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="files" pt="sm">
            <Stack gap="md">
              <Group justify="space-between" align="center" wrap="nowrap" className="torrent-player-subtitle-manager-actions">
              <Text c="dimmed" size="sm">{t("media.player.subtitleManagerHint")}</Text>
              <Tooltip label={t("media.player.subtitleUploadPlaceholder")} withArrow>
                <ActionIcon
                  variant="light"
                  size="lg"
                  aria-label={t("media.player.subtitleUpload")}
                  title={t("media.player.subtitleUploadPlaceholder")}
                  disabled={subtitleLoading}
                  onClick={() => {
                    subtitleUploadInputRef.current?.click();
                  }}
                >
                  <Upload size={18} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <input
              ref={subtitleUploadInputRef}
              type="file"
              accept=".srt,.vtt,.ass,.ssa"
              disabled={subtitleLoading}
              className="torrent-subtitle-upload-input"
              onChange={(event) => {
                const picked = event.currentTarget.files?.[0] || null;
                event.currentTarget.value = "";
                if (!picked) return;
                void onSubtitleUploadPick(picked);
              }}
            />

            {subtitleItems.length === 0 ? (
              <Text size="sm" c="dimmed">{t("media.player.subtitleManagerEmpty")}</Text>
            ) : (
              <Stack gap="xs">
                {subtitleItems.map((item) => (
                  <div className="torrent-subtitle-item-card" key={item.id}>
                    <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
                      <Stack gap={2} style={{ minWidth: 0 }}>
                        <Text fw={700} size="sm" className="torrent-subtitle-item-title">
                          {item.label || `Subtitle ${item.id}`}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {t("media.player.subtitleOffset")}: {formatSubtitleOffsetLabel(item.offsetSeconds || 0)}
                        </Text>
                      </Stack>
                      <Group gap={4} wrap="nowrap">
                        <ActionIcon
                          size="sm"
                          variant="light"
                          disabled={subtitleLoading}
                          onClick={() => {
                            void onAdjustSubtitleOffset(item.id, -0.5);
                          }}
                          aria-label={t("media.player.subtitleOffsetMinus")}
                        >
                          <Minus size={14} />
                        </ActionIcon>
                        <ActionIcon
                          size="sm"
                          variant="light"
                          disabled={subtitleLoading}
                          onClick={() => {
                            void onAdjustSubtitleOffset(item.id, 0.5);
                          }}
                          aria-label={t("media.player.subtitleOffsetPlus")}
                        >
                          <Plus size={14} />
                        </ActionIcon>
                        <ActionIcon
                          size="sm"
                          color="red"
                          variant="light"
                          disabled={subtitleLoading}
                          onClick={() => {
                            void onDeleteSubtitle(item.id);
                          }}
                          aria-label={t("media.player.subtitleDelete")}
                        >
                          <Trash2 size={14} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  </div>
                ))}
              </Stack>
            )}
            {subtitleSiteLinks.length > 0 ? (
              <div className="torrent-subtitle-site-links">
                <Group gap="xs" wrap="wrap">
                  {subtitleSiteLinks.map((link) => (
                    <Button
                      key={link.id}
                      component="a"
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      variant="light"
                      size="xs"
                      rightSection={<ExternalLink size={13} />}
                    >
                      {link.label}
                    </Button>
                  ))}
                </Group>
              </div>
            ) : null}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="style" pt="sm">
            <Stack gap="md">
            <div className="torrent-inline-settings-section">
              <div className="torrent-inline-settings-title">{t("media.player.subtitleStyleSize")}</div>
              <div className="torrent-inline-rate-grid torrent-inline-rate-grid-6">
                {subtitleScaleOptions.map((value, index) => ({
                  value,
                  label: ["S", "M", "L", "XL", "XXL", "XXXL"][index] || "L"
                })).map((item) => (
                  <button
                    key={`ssm:${item.value}`}
                    type="button"
                    className={`torrent-inline-rate-btn${Math.abs(subtitleStylePreset.scale - item.value) < 0.01 ? " is-active" : ""}`}
                    onClick={() => {
                      setSubtitleStylePreset((current) => ({ ...current, scale: item.value }));
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="torrent-inline-settings-title">{t("media.player.subtitleStylePosition")}</div>
              <div className="torrent-inline-rate-grid torrent-inline-rate-grid-6">
                {[
                  { value: 0, label: "0%" },
                  { value: 4, label: "4%" },
                  { value: 8, label: "8%" },
                  { value: 12, label: "12%" },
                  { value: 15, label: "15%" },
                  { value: 18, label: "18%" }
                ].map((item) => (
                  <button
                    key={`spm:${item.value}`}
                    type="button"
                    className={`torrent-inline-rate-btn${subtitleStylePreset.verticalPercent === item.value ? " is-active" : ""}`}
                    onClick={() => {
                      setSubtitleStylePreset((current) => ({ ...current, verticalPercent: item.value }));
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="torrent-inline-settings-title">{t("media.player.subtitleStyleColor")}</div>
              <div className="torrent-inline-rate-grid torrent-inline-rate-grid-6">
                {[
                  { value: "#f6f9ff", label: t("media.player.subtitleStyleColorWhite") },
                  { value: "#ffe082", label: t("media.player.subtitleStyleColorYellow") },
                  { value: "#d3ecff", label: t("media.player.subtitleStyleColorCyan") },
                  { value: "#b6f8c8", label: t("media.player.subtitleStyleColorGreen") },
                  { value: "#ffc88a", label: t("media.player.subtitleStyleColorOrange") },
                  { value: "#ffd2ef", label: t("media.player.subtitleStyleColorPink") }
                ].map((item) => (
                  <button
                    key={`scm:${item.value}`}
                    type="button"
                    className={`torrent-inline-rate-btn${subtitleStylePreset.textColor === item.value ? " is-active" : ""}`}
                    onClick={() => {
                      setSubtitleStylePreset((current) => ({ ...current, textColor: item.value }));
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="torrent-inline-settings-title">{t("media.player.subtitleStyleBackground")}</div>
              <div className="torrent-inline-rate-grid torrent-inline-rate-grid-6">
                {[
                  { value: "rgba(0, 0, 0, 0)", label: t("media.player.subtitleStyleBgNone") },
                  { value: "rgba(0, 0, 0, 0.15)", label: "15%" },
                  { value: "rgba(0, 0, 0, 0.25)", label: "25%" },
                  { value: "rgba(0, 0, 0, 0.4)", label: "40%" },
                  { value: "rgba(0, 0, 0, 0.55)", label: "55%" },
                  { value: "rgba(0, 0, 0, 0.7)", label: "70%" }
                ].map((item) => (
                  <button
                    key={`sbm:${item.value}`}
                    type="button"
                    className={`torrent-inline-rate-btn${subtitleStylePreset.backgroundColor === item.value ? " is-active" : ""}`}
                    onClick={() => {
                      setSubtitleStylePreset((current) => ({ ...current, backgroundColor: item.value }));
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </div>
    </div>
  ) : null;

  const resumePromptPanel = resumePromptOpened ? (
    <div className="torrent-player-center-layer" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <div className="torrent-player-floating-panel torrent-player-resume-panel">
        <div className="torrent-player-panel-header">
          <div className="torrent-player-panel-title">{t("media.player.resumePromptTitle")}</div>
          <button
            type="button"
            className="torrent-inline-title-icon-btn"
            onClick={onResumePromptRestart}
            aria-label={t("common.close")}
          >
            <X size={14} />
          </button>
        </div>
        <Text size="sm" c="dimmed">
          {t("media.player.resumePromptMessage")} <span className="torrent-player-resume-time">{formatClock(resumePromptSeconds)}</span>
        </Text>
        <div className="torrent-player-panel-actions">
          <button type="button" className="torrent-player-panel-action" onClick={onResumePromptRestart}>
            {t("media.player.resumePromptRestart")}
          </button>
          <button type="button" className="torrent-player-panel-action is-primary" onClick={() => void onResumePromptContinue()}>
            {t("media.player.resumePromptContinue")}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const diagnosticsModal = (
    <Modal
      opened={diagnosticsOpened}
      onClose={onCloseDiagnostics}
      title={t("media.player.diagnosticsTitle")}
      size="lg"
      classNames={{
        content: "torrent-player-modal-content",
        header: "torrent-player-modal-header",
        title: "torrent-player-modal-title",
        body: "torrent-player-modal-body"
      }}
    >
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Text c="dimmed" size="sm">{t("media.player.diagnosticsHint")}</Text>
          <Group gap="xs">
            <Button variant="default" size="xs" onClick={() => setDiagnostics([])}>{t("media.player.clearLogs")}</Button>
            <Button size="xs" onClick={() => void onCopyLogs()}>{t("media.player.copyLogs")}</Button>
          </Group>
        </Group>
        <ScrollArea h={320} className="torrent-diagnostics-scroll">
          {diagnostics.length === 0 ? (
            <Text c="dimmed" size="sm">{t("media.player.noDiagnostics")}</Text>
          ) : (
            <Stack gap="xs">
              {diagnostics.map((item) => (
                <div className="torrent-diagnostic-item" key={item.id}>
                  <Group justify="space-between" gap="xs">
                    <Text size="xs" fw={700}>[{item.level.toUpperCase()}] {item.step}</Text>
                    <Text size="xs" c="dimmed">{new Date(item.timestamp).toLocaleTimeString()}</Text>
                  </Group>
                  <Text size="sm" className="torrent-diagnostic-line">{item.message}</Text>
                  {item.detailsText ? <Text size="xs" c="dimmed" className="torrent-diagnostic-details">{item.detailsText}</Text> : null}
                </div>
              ))}
            </Stack>
          )}
        </ScrollArea>
      </Stack>
    </Modal>
  );

  return (
    <>
      {scope !== "global" ? subtitleManagerPanel : null}
      {scope !== "global" ? resumePromptPanel : null}
      {scope !== "stage" ? diagnosticsModal : null}
    </>
  );
}
