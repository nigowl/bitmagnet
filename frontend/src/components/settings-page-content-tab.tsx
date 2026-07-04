"use client";

import type { Dispatch, SetStateAction } from "react";
import { Accordion, Button, Group, Loader, Stack, Switch, Tabs, Text, TextInput, Select, NumberInput, Textarea } from "@mantine/core";
import type { PluginInputs, PluginTestResult, SubtitleTemplate, SystemSettings } from "./settings-page.types";
import { SettingsPluginResultPreview, SubtitleTemplateTable } from "./settings-page.shared";

type TFunction = (key: string) => string;
type SettingsPageStateSetter<T> = Dispatch<SetStateAction<T>>;

type SettingsContentTabProps = {
  t: TFunction;
  settings: SystemSettings;
  setSettings: SettingsPageStateSetter<SystemSettings>;
  pluginInputs: PluginInputs;
  setPluginInputs: SettingsPageStateSetter<PluginInputs>;
  pluginTesting: Record<string, boolean>;
  pluginResults: Record<string, PluginTestResult | null>;
  runPluginTest: (plugin: "tmdb" | "imdb" | "douban") => void;
  subtitleTemplates: SubtitleTemplate[];
  subtitleTemplatesLoading: boolean;
  subtitleTemplateDeleting: Record<string, boolean>;
  openCreateSubtitleModal: () => void;
  openEditSubtitleModal: (template: SubtitleTemplate) => void;
  deleteSubtitleTemplate: (templateId: string) => void;
};

export function SettingsPageContentTab({
  t,
  settings,
  setSettings,
  pluginInputs,
  setPluginInputs,
  pluginTesting,
  pluginResults,
  runPluginTest,
  subtitleTemplates,
  subtitleTemplatesLoading,
  subtitleTemplateDeleting,
  openCreateSubtitleModal,
  openEditSubtitleModal,
  deleteSubtitleTemplate
}: SettingsContentTabProps) {
  return (
    <Tabs.Panel value="content" pt="md">
      <Stack gap="md">
        <Text fw={700}>{t("settings.sitePluginTitle")}</Text>
        <Accordion
          className="settings-sections-accordion"
          variant="separated"
          radius="lg"
          multiple
          defaultValue={["tmdb", "imdb", "douban"]}
        >
          <Accordion.Item value="tmdb">
            <Accordion.Control>TMDB</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Switch
                  label={t("settings.pluginTmdbEnabled")}
                  checked={settings.tmdbEnabled}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setSettings((current) => ({ ...current, tmdbEnabled: checked }));
                  }}
                />
                {settings.tmdbEnabled ? (
                  <Stack gap="sm" className="settings-toggle-panel">
                    <Group grow>
                      <TextInput
                        label={t("settings.testQuery")}
                        placeholder={t("settings.testQueryPlaceholder")}
                        value={pluginInputs.tmdb.query}
                        onChange={(event) => setPluginInputs((current) => ({ ...current, tmdb: { ...current.tmdb, query: event.currentTarget.value } }))}
                      />
                      <Select
                        label={t("settings.testContentType")}
                        value={pluginInputs.tmdb.contentType}
                        data={[
                          { value: "movie", label: t("contentTypes.movie") },
                          { value: "tv_show", label: t("contentTypes.tv_show") }
                        ]}
                        allowDeselect={false}
                        onChange={(value) => setPluginInputs((current) => ({ ...current, tmdb: { ...current.tmdb, contentType: value || "movie" } }))}
                      />
                      <TextInput
                        label={t("settings.testYear")}
                        placeholder="2026"
                        value={pluginInputs.tmdb.year}
                        onChange={(event) => setPluginInputs((current) => ({ ...current, tmdb: { ...current.tmdb, year: event.currentTarget.value } }))}
                      />
                    </Group>
                    <Group justify="flex-end">
                      <Button loading={Boolean(pluginTesting.tmdb)} onClick={() => runPluginTest("tmdb")}>
                        {t("settings.testButton")}
                      </Button>
                    </Group>
                    <SettingsPluginResultPreview result={pluginResults.tmdb} />
                  </Stack>
                ) : null}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item value="imdb">
            <Accordion.Control>IMDb</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Switch
                  label={t("settings.pluginImdbEnabled")}
                  checked={settings.imdbEnabled}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setSettings((current) => ({ ...current, imdbEnabled: checked }));
                  }}
                />
                {settings.imdbEnabled ? (
                  <Stack gap="sm" className="settings-toggle-panel">
                    <TextInput
                      label={t("settings.testIMDbID")}
                      placeholder="tt32252887"
                      value={pluginInputs.imdb.imdbId}
                      onChange={(event) => setPluginInputs((current) => ({ ...current, imdb: { ...current.imdb, imdbId: event.currentTarget.value } }))}
                    />
                    <Group justify="flex-end">
                      <Button loading={Boolean(pluginTesting.imdb)} onClick={() => runPluginTest("imdb")}>
                        {t("settings.testButton")}
                      </Button>
                    </Group>
                    <SettingsPluginResultPreview result={pluginResults.imdb} />
                  </Stack>
                ) : null}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item value="douban">
            <Accordion.Control>Douban</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Switch
                  label={t("settings.doubanEnabled")}
                  checked={settings.doubanEnabled}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setSettings((current) => ({ ...current, doubanEnabled: checked }));
                  }}
                />
                {settings.doubanEnabled ? (
                  <Stack gap="sm" className="settings-toggle-panel">
                    <Group grow>
                      <TextInput
                        label={t("settings.testTitle")}
                        placeholder={t("settings.testTitlePlaceholder")}
                        value={pluginInputs.douban.title}
                        onChange={(event) => setPluginInputs((current) => ({ ...current, douban: { ...current.douban, title: event.currentTarget.value } }))}
                      />
                      <Select
                        label={t("settings.testContentType")}
                        value={pluginInputs.douban.contentType}
                        data={[
                          { value: "movie", label: t("contentTypes.movie") },
                          { value: "tv_show", label: t("contentTypes.tv_show") }
                        ]}
                        allowDeselect={false}
                        onChange={(value) => setPluginInputs((current) => ({ ...current, douban: { ...current.douban, contentType: value || "movie" } }))}
                      />
                      <TextInput
                        label={t("settings.testYear")}
                        placeholder="2026"
                        value={pluginInputs.douban.year}
                        onChange={(event) => setPluginInputs((current) => ({ ...current, douban: { ...current.douban, year: event.currentTarget.value } }))}
                      />
                    </Group>
                    <NumberInput
                      label={t("settings.doubanMinScore")}
                      value={settings.doubanMinScore}
                      min={0}
                      max={1}
                      step={0.01}
                      decimalScale={2}
                      onChange={(value) => setSettings((current) => ({
                        ...current,
                        doubanMinScore: typeof value === "number" && Number.isFinite(value) ? value : current.doubanMinScore
                      }))}
                    />
                    <Textarea
                      label={t("settings.doubanCookie")}
                      minRows={4}
                      autosize
                      value={settings.doubanCookie}
                      onChange={(event) => setSettings((current) => ({ ...current, doubanCookie: event.currentTarget.value }))}
                    />
                    <TextInput
                      label={t("settings.doubanUserAgent")}
                      value={settings.doubanUserAgent}
                      onChange={(event) => setSettings((current) => ({ ...current, doubanUserAgent: event.currentTarget.value }))}
                    />
                    <TextInput
                      label={t("settings.doubanAcceptLanguage")}
                      value={settings.doubanAcceptLanguage}
                      onChange={(event) => setSettings((current) => ({ ...current, doubanAcceptLanguage: event.currentTarget.value }))}
                    />
                    <TextInput
                      label={t("settings.doubanReferer")}
                      value={settings.doubanReferer}
                      onChange={(event) => setSettings((current) => ({ ...current, doubanReferer: event.currentTarget.value }))}
                    />
                    <Group justify="flex-end">
                      <Button loading={Boolean(pluginTesting.douban)} onClick={() => runPluginTest("douban")}>
                        {t("settings.testButton")}
                      </Button>
                    </Group>
                    <SettingsPluginResultPreview result={pluginResults.douban} />
                  </Stack>
                ) : null}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
        <Accordion
          className="settings-sections-accordion"
          variant="separated"
          radius="lg"
          multiple
          defaultValue={["subtitle-templates"]}
        >
          <Accordion.Item value="subtitle-templates">
            <Accordion.Control>{t("settings.subtitleTemplateTitle")}</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Group justify="space-between" align="flex-end">
                  <Text c="dimmed" size="sm">{t("settings.subtitleTemplateHint")}</Text>
                  <Button onClick={openCreateSubtitleModal}>
                    {t("settings.subtitleTemplateAdd")}
                  </Button>
                </Group>
                {subtitleTemplatesLoading ? (
                  <Group justify="center" py="md">
                    <Loader size="sm" />
                  </Group>
                ) : (
                  <SubtitleTemplateTable
                    templates={subtitleTemplates}
                    emptyLabel={t("settings.subtitleTemplateEmpty")}
                    nameLabel={t("settings.subtitleTemplateName")}
                    urlLabel={t("settings.subtitleTemplateURL")}
                    enabledLabel={t("settings.subtitleTemplateEnabled")}
                    actionsLabel={t("settings.subtitleTemplateActions")}
                    enabledYesLabel={t("settings.subtitleTemplateEnabledYes")}
                    enabledNoLabel={t("settings.subtitleTemplateEnabledNo")}
                    editLabel={t("settings.subtitleTemplateEdit")}
                    deleteLabel={t("settings.subtitleTemplateDelete")}
                    deleting={subtitleTemplateDeleting}
                    onEdit={openEditSubtitleModal}
                    onDelete={(templateId) => {
                      void deleteSubtitleTemplate(templateId);
                    }}
                  />
                )}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Tabs.Panel>
  );
}
