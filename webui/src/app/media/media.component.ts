import {
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
} from "@angular/core";
import { FormControl } from "@angular/forms";
import { NgOptimizedImage } from "@angular/common";
import { Apollo, gql } from "apollo-angular";
import { TranslocoService } from "@jsverse/transloco";
import {
  EMPTY,
  Subscription,
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  merge,
} from "rxjs";
import { map } from "rxjs/operators";
import { AppModule } from "../app.module";
import { ErrorsService } from "../errors/errors.service";
import * as generated from "../graphql/generated";
import { DocumentTitleComponent } from "../layout/document-title.component";
import { PaginatorComponent } from "../paginator/paginator.component";
import { FilesizePipe } from "../pipes/filesize.pipe";
import { TimeAgoPipe } from "../pipes/time-ago.pipe";

type MovieSortKey = "popular" | "latest" | "updated" | "name";
type MediaContentType = "all" | "movie" | "tv_show";

type MediaResolutionOption = {
  value: generated.VideoResolution;
  label: string;
};

type MovieSortOption = {
  key: MovieSortKey;
  field: generated.TorrentContentOrderByField;
  descending: boolean;
};

type MediaMovie = {
  infoHash: string;
  title: string;
  seeders?: number | null;
  publishedAt: string;
  videoResolution?: generated.VideoResolution | null;
  torrent: {
    name: string;
    size: number;
  };
  content?: {
    title: string;
    releaseYear?: number | null;
    overview?: string | null;
    collections: Array<{
      type: string;
      name: string;
    }>;
    attributes: Array<{
      source: string;
      key: string;
      value: string;
    }>;
  } | null;
};

type MediaSearchResult = {
  totalCount: number;
  totalCountIsEstimate: boolean;
  hasNextPage?: boolean | null;
  aggregations?: {
    contentSource?: generated.ContentSourceAgg[] | null;
    genre?: generated.GenreAgg[] | null;
    language?: generated.LanguageAgg[] | null;
    releaseYear?: generated.ReleaseYearAgg[] | null;
    videoResolution?: generated.VideoResolutionAgg[] | null;
  } | null;
  items: MediaMovie[];
};

type MediaQuery = {
  torrentContent: {
    search: MediaSearchResult;
  };
};

type MediaQueryVariables = {
  input: generated.TorrentContentSearchQueryInput;
  includeAggregations: boolean;
};

type LoadOptions = {
  cached?: boolean;
  includeAggregations?: boolean;
};

const defaultPageSize = 20;

const mediaDocument = gql`
  query MediaCenter(
    $input: TorrentContentSearchQueryInput!
    $includeAggregations: Boolean!
  ) {
    torrentContent {
      search(input: $input) {
        totalCount
        totalCountIsEstimate
        hasNextPage
        aggregations @include(if: $includeAggregations) {
          genre {
            value
            label
            count
            isEstimate
          }
          language {
            value
            label
            count
            isEstimate
          }
          contentSource {
            value
            label
            count
            isEstimate
          }
          releaseYear {
            value
            label
            count
            isEstimate
          }
          videoResolution {
            value
            label
            count
            isEstimate
          }
        }
        items {
          infoHash
          title
          seeders
          publishedAt
          videoResolution
          torrent {
            name
            size
          }
          content {
            title
            releaseYear
            overview
            collections {
              type
              name
            }
            attributes {
              source
              key
              value
            }
          }
        }
      }
    }
  }
`;

const sortOptions: MovieSortOption[] = [
  {
    key: "popular",
    field: "seeders",
    descending: true,
  },
  {
    key: "latest",
    field: "published_at",
    descending: true,
  },
  {
    key: "updated",
    field: "updated_at",
    descending: true,
  },
  {
    key: "name",
    field: "name",
    descending: false,
  },
];

@Component({
  selector: "app-media",
  standalone: true,
  imports: [
    AppModule,
    DocumentTitleComponent,
    FilesizePipe,
    NgOptimizedImage,
    PaginatorComponent,
    TimeAgoPipe,
  ],
  templateUrl: "./media.component.html",
  styleUrl: "./media.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaComponent implements OnInit, OnDestroy {
  private apollo = inject(Apollo);
  private cdr = inject(ChangeDetectorRef);
  private errorsService = inject(ErrorsService);
  transloco = inject(TranslocoService);

  searchControl = new FormControl("", { nonNullable: true });
  contentTypeControl = new FormControl<MediaContentType>("all", {
    nonNullable: true,
  });
  sourceControl = new FormControl<string | null>(null);
  genreControl = new FormControl<string | null>(null);
  languageControl = new FormControl<generated.Language | null>(null);
  resolutionControl = new FormControl<generated.VideoResolution | null>(null);
  yearControl = new FormControl<number | null>(null);
  sortControl = new FormControl<MovieSortKey>("popular", {
    nonNullable: true,
  });

  sortOptions = sortOptions;

  result: MediaSearchResult = {
    items: [],
    totalCount: 0,
    totalCountIsEstimate: false,
    aggregations: {},
  };
  loading = false;

  page = 1;
  pageSize = defaultPageSize;

  private readonly preferredContentSources = ["tmdb", "imdb", "tvdb"];
  private currentSubscription?: Subscription;
  private subscriptions: Subscription[] = [];
  private requestSequence = 0;
  private activeRequestSequence = 0;

  ngOnInit(): void {
    const filterChanges$ = merge(
      this.searchControl.valueChanges.pipe(
        debounceTime(300),
        distinctUntilChanged(),
      ),
      this.contentTypeControl.valueChanges.pipe(distinctUntilChanged()),
      this.sourceControl.valueChanges.pipe(distinctUntilChanged()),
      this.genreControl.valueChanges.pipe(distinctUntilChanged()),
      this.languageControl.valueChanges.pipe(distinctUntilChanged()),
      this.resolutionControl.valueChanges.pipe(distinctUntilChanged()),
      this.yearControl.valueChanges.pipe(distinctUntilChanged()),
    );

    this.subscriptions.push(
      filterChanges$.subscribe(() => {
        this.page = 1;
        this.loadMovies({ includeAggregations: true });
      }),
      this.sortControl.valueChanges
        .pipe(distinctUntilChanged())
        .subscribe(() => {
          this.page = 1;
          this.loadMovies();
        }),
    );

    this.loadMovies({ includeAggregations: true });
  }

  ngOnDestroy(): void {
    this.currentSubscription?.unsubscribe();
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    this.subscriptions = [];
  }

  get genreOptions(): generated.GenreAgg[] {
    return this.result.aggregations?.genre ?? [];
  }

  get sourceOptions(): string[] {
    const options = this.result.aggregations?.contentSource ?? [];
    const seen = new Set<string>();
    const ordered: string[] = [];

    for (const source of this.preferredContentSources) {
      seen.add(source);
      ordered.push(source);
    }

    for (const option of options) {
      if (!seen.has(option.value)) {
        seen.add(option.value);
        ordered.push(option.value);
      }
    }

    return ordered;
  }

  get yearOptions(): generated.ReleaseYearAgg[] {
    return (this.result.aggregations?.releaseYear ?? []).filter(
      (year) => year.value != null,
    );
  }

  get languageOptions(): generated.LanguageAgg[] {
    return this.result.aggregations?.language ?? [];
  }

  get resolutionOptions(): MediaResolutionOption[] {
    return (this.result.aggregations?.videoResolution ?? [])
      .filter(
        (
          resolution,
        ): resolution is generated.VideoResolutionAgg & {
          value: generated.VideoResolution;
        } => resolution.value != null,
      )
      .map((resolution) => ({
        value: resolution.value,
        label: resolution.label,
      }));
  }

  get selectedContentType(): MediaContentType {
    return this.contentTypeControl.value;
  }

  handlePageEvent(event: { page: number; pageSize: number }): void {
    this.page = event.page;
    this.pageSize = event.pageSize;
    this.loadMovies();
  }

  refresh(): void {
    this.loadMovies({ cached: false });
  }

  trackByInfoHash(_: number, movie: MediaMovie): string {
    return movie.infoHash;
  }

  posterUrl(movie: MediaMovie, size = "w185"): string | undefined {
    const posterPath = this.getAttribute(movie, "poster_path", "tmdb");
    return posterPath
      ? `https://image.tmdb.org/t/p/${size}/${posterPath}`
      : undefined;
  }

  movieGenres(movie: MediaMovie): string[] {
    return (
      movie.content?.collections
        ?.filter((collection) => collection.type === "genre")
        .map((collection) => collection.name)
        .sort() ?? []
    );
  }

  primaryGenre(movie: MediaMovie): string | undefined {
    return this.movieGenres(movie)[0];
  }

  qualityLabel(movie: MediaMovie): string | undefined {
    return movie.videoResolution?.toUpperCase().replaceAll("_", " ");
  }

  displayTitle(movie: MediaMovie): string {
    return movie.content?.title ?? movie.title;
  }

  contentSourceLabel(source: string): string {
    const translationKey = `media.sources.${source}`;
    const translated = this.transloco.translate(translationKey);
    if (translated !== translationKey) {
      return translated;
    }

    const aggregation = (this.result.aggregations?.contentSource ?? []).find(
      (item) => item.value === source,
    );
    if (aggregation?.label) {
      return aggregation.label;
    }

    return source.toUpperCase();
  }

  languageLabel(language: generated.Language, fallbackLabel?: string): string {
    const translationKey = `languages.${language}`;
    const translated = this.transloco.translate(translationKey);
    if (translated !== translationKey) {
      return translated;
    }

    return fallbackLabel || language.toUpperCase();
  }

  resolutionLabel(
    resolution: generated.VideoResolution,
    fallbackLabel?: string,
  ): string {
    if (fallbackLabel) {
      return fallbackLabel;
    }

    return resolution.startsWith("V") ? resolution.slice(1) : resolution;
  }

  setContentTypeFilter(value: MediaContentType): void {
    if (this.contentTypeControl.value !== value) {
      this.contentTypeControl.setValue(value);
    }
  }

  setSourceFilter(value: string | null): void {
    if (this.sourceControl.value !== value) {
      this.sourceControl.setValue(value);
    }
  }

  setGenreFilter(value: string | null): void {
    if (this.genreControl.value !== value) {
      this.genreControl.setValue(value);
    }
  }

  setYearFilter(value: number | null | undefined): void {
    const normalizedValue = value ?? null;
    if (this.yearControl.value !== normalizedValue) {
      this.yearControl.setValue(normalizedValue);
    }
  }

  setLanguageFilter(value: generated.Language | null): void {
    if (this.languageControl.value !== value) {
      this.languageControl.setValue(value);
    }
  }

  setResolutionFilter(value: generated.VideoResolution | null): void {
    if (this.resolutionControl.value !== value) {
      this.resolutionControl.setValue(value);
    }
  }

  setSortFilter(value: MovieSortKey): void {
    if (this.sortControl.value !== value) {
      this.sortControl.setValue(value);
    }
  }

  mediaPlaceholderIcon(): string {
    if (this.selectedContentType === "tv_show") {
      return "live_tv";
    }

    if (this.selectedContentType === "movie") {
      return "local_movies";
    }

    return "movie_filter";
  }

  private loadMovies(options: LoadOptions = {}): void {
    const { cached = true, includeAggregations = false } = options;
    const requestSequence = ++this.requestSequence;
    this.activeRequestSequence = requestSequence;

    this.currentSubscription?.unsubscribe();
    this.loading = true;
    this.cdr.markForCheck();

    this.currentSubscription = this.apollo
      .query<MediaQuery, MediaQueryVariables>({
        query: mediaDocument,
        variables: this.buildQueryVariables(cached, includeAggregations),
        fetchPolicy: "no-cache",
      })
      .pipe(
        map((result) => result.data.torrentContent.search),
        finalize(() => {
          if (this.activeRequestSequence === requestSequence) {
            this.loading = false;
            this.cdr.markForCheck();
          }
        }),
        catchError((error: Error) => {
          const message = this.transloco.translate("media.load_error", {
            message: error.message,
          });
          this.errorsService.addError(message);
          return EMPTY;
        }),
      )
      .subscribe((result) => {
        if (this.activeRequestSequence !== requestSequence) {
          return;
        }

        this.result = {
          ...result,
          aggregations: includeAggregations
            ? (result.aggregations ?? {})
            : this.result.aggregations,
        };
        this.cdr.markForCheck();
      });
  }

  private buildQueryVariables(
    cached: boolean,
    includeAggregations: boolean,
  ): MediaQueryVariables {
    const sortOption =
      sortOptions.find((option) => option.key === this.sortControl.value) ??
      sortOptions[0];
    const queryString = this.searchControl.value.trim();

    return {
      includeAggregations,
      input: {
        cached,
        hasNextPage: true,
        limit: this.pageSize,
        page: this.page,
        queryString: queryString || undefined,
        totalCount: true,
        orderBy: [
          {
            field: sortOption.field,
            descending: sortOption.descending,
          },
        ],
        facets: {
          contentType: {
            filter:
              this.selectedContentType === "all"
                ? undefined
                : [this.selectedContentType],
          },
          contentSource: {
            aggregate: includeAggregations,
            filter: this.sourceControl.value
              ? [this.sourceControl.value]
              : undefined,
          },
          genre: {
            aggregate: includeAggregations,
            filter: this.genreControl.value
              ? [this.genreControl.value]
              : undefined,
          },
          language: {
            aggregate: includeAggregations,
            filter: this.languageControl.value
              ? [this.languageControl.value]
              : undefined,
          },
          releaseYear: {
            aggregate: includeAggregations,
            filter:
              this.yearControl.value != null
                ? [this.yearControl.value]
                : undefined,
          },
          videoResolution: {
            aggregate: includeAggregations,
            filter: this.resolutionControl.value
              ? [this.resolutionControl.value]
              : undefined,
          },
        },
      },
    };
  }

  private getAttribute(
    movie: MediaMovie,
    key: string,
    source?: string,
  ): string | undefined {
    return movie.content?.attributes?.find(
      (attribute) =>
        attribute.key === key &&
        (source === undefined || attribute.source === source),
    )?.value;
  }
}
