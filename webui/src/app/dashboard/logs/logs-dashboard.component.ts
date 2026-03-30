import {
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
} from "@angular/core";
import { TranslocoService } from "@jsverse/transloco";
import { HttpClient } from "@angular/common/http";
import { FormControl } from "@angular/forms";
import { interval, Subscription } from "rxjs";
import { AppModule } from "../../app.module";
import { DocumentTitleComponent } from "../../layout/document-title.component";
import { PaginatorComponent } from "../../paginator/paginator.component";
import type { PageEvent } from "../../paginator/paginator.types";

type SystemLogsResponse = {
  enabled: boolean;
  path: string;
  currentFile?: string;
  updatedAt?: string;
  totalLines: number;
  lines: string[];
  message?: string;
};

type LogLevel = "debug" | "info" | "warn" | "error" | "other";

type RenderedLogLine = {
  id: number;
  lineNumber: number;
  text: string;
  level: LogLevel;
};

@Component({
  selector: "app-logs-dashboard",
  standalone: true,
  imports: [AppModule, DocumentTitleComponent, PaginatorComponent],
  templateUrl: "./logs-dashboard.component.html",
  styleUrl: "./logs-dashboard.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogsDashboardComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private http = inject(HttpClient);
  private transloco = inject(TranslocoService);

  autoRefreshControl = new FormControl(true, { nonNullable: true });

  readonly pageSizeOptions = [100, 200, 500, 1000];

  page = 1;
  pageSize = 100;

  loading = false;
  response: SystemLogsResponse = {
    enabled: false,
    path: "",
    totalLines: 0,
    lines: [],
  };
  renderedLines: RenderedLogLine[] = [];

  private refreshSubscription?: Subscription;
  private currentRequest?: Subscription;
  private subscriptions: Subscription[] = [];
  private requestSequence = 0;
  private activeRequestSequence = 0;

  ngOnInit(): void {
    this.subscriptions.push(
      this.autoRefreshControl.valueChanges.subscribe(() =>
        this.configureRefresh(),
      ),
    );

    this.configureRefresh();
    this.refresh();
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
    this.currentRequest?.unsubscribe();
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    this.subscriptions = [];
  }

  refresh(): void {
    const requestSequence = ++this.requestSequence;
    this.activeRequestSequence = requestSequence;

    this.currentRequest?.unsubscribe();
    this.loading = true;
    this.cdr.markForCheck();

    this.currentRequest = this.http
      .get<SystemLogsResponse>("/api/logs", {
        params: {
          lines: String(this.pageSize),
          page: String(this.page),
        },
      })
      .subscribe({
        next: (response) => {
          if (this.activeRequestSequence !== requestSequence) {
            return;
          }

          this.response = response;

          const pageCount = Math.max(
            1,
            Math.ceil(response.totalLines / this.pageSize),
          );
          if (this.page > pageCount) {
            this.page = pageCount;
            this.refresh();
            return;
          }

          this.rebuildRenderedLines();
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          if (this.activeRequestSequence !== requestSequence) {
            return;
          }

          this.response = {
            enabled: false,
            path: "",
            totalLines: 0,
            lines: [],
            message: this.transloco.translate("dashboard.logs.load_error"),
          };
          this.renderedLines = [];
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  handlePageEvent(event: PageEvent): void {
    this.page = event.page;
    this.pageSize = event.pageSize;
    this.refresh();
  }

  trackByRenderedLine(_: number, line: RenderedLogLine): number {
    return line.id;
  }

  levelLabel(level: LogLevel): string {
    return this.transloco.translate(`dashboard.logs.levels.${level}`);
  }

  private rebuildRenderedLines(): void {
    const lines = this.response.lines;
    if (!lines.length || this.response.totalLines <= 0) {
      this.renderedLines = [];
      return;
    }

    const pageOffset = (this.page - 1) * this.pageSize;
    const endLine = Math.max(0, this.response.totalLines - pageOffset);
    const startLine = Math.max(1, endLine - lines.length + 1);

    this.renderedLines = lines.map((line, index) => {
      const lineNumber = startLine + index;
      const text = this.stripAnsi(line);
      return {
        id: lineNumber,
        lineNumber,
        text,
        level: this.parseLogLevel(text),
      };
    });
  }

  private stripAnsi(value: string): string {
    return value.replaceAll(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
  }

  private parseLogLevel(value: string): LogLevel {
    const line = value.toUpperCase();
    const level = line.match(
      /\b(DEBUG|INFO|WARN|WARNING|ERROR|CRITICAL|ALERT|EMERGENCY)\b/,
    )?.[1];

    switch (level) {
      case "DEBUG":
        return "debug";
      case "INFO":
        return "info";
      case "WARN":
      case "WARNING":
        return "warn";
      case "ERROR":
      case "CRITICAL":
      case "ALERT":
      case "EMERGENCY":
        return "error";
      default:
        return "other";
    }
  }

  private configureRefresh(): void {
    this.refreshSubscription?.unsubscribe();

    if (!this.autoRefreshControl.value) {
      return;
    }

    this.refreshSubscription = interval(5000).subscribe(() => this.refresh());
  }
}
