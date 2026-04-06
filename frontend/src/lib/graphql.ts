export const HEALTH_QUERY = `
query Health {
  health {
    status
    checks {
      key
      status
      timestamp
      error
    }
  }
  workers {
    listAll {
      workers {
        key
        enabled
        started
      }
    }
  }
}
`;

export const VERSION_QUERY = `
query Version {
  version
}
`;

export const QUEUE_METRICS_QUERY = `
query QueueMetrics($input: QueueMetricsQueryInput!) {
  queue {
    metrics(input: $input) {
      buckets {
        queue
        status
        createdAtBucket
        ranAtBucket
        count
        latency
      }
    }
  }
}
`;

export const TORRENT_METRICS_QUERY = `
query TorrentMetrics($input: TorrentMetricsQueryInput!) {
  torrent {
    metrics(input: $input) {
      buckets {
        source
        updated
        bucket
        count
      }
    }
    listSources {
      sources {
        key
        name
      }
    }
  }
}
`;

export const TORRENT_CONTENT_SEARCH_QUERY = `
query TorrentContentSearch($input: TorrentContentSearchQueryInput!) {
  torrentContent {
    search(input: $input) {
      totalCount
      totalCountIsEstimate
      hasNextPage
      items {
        id
        infoHash
        contentType
        contentSource
        contentId
        title
        seeders
        leechers
        publishedAt
        createdAt
        updatedAt
        torrent {
          infoHash
          name
          size
          filesStatus
          filesCount
          hasFilesInfo
          singleFile
          fileType
          seeders
          leechers
          tagNames
          magnetUri
          createdAt
          updatedAt
          sources {
            key
            name
          }
        }
        content {
          type
          source
          id
          title
          runtime
          releaseDate
          releaseYear
          overview
          voteAverage
          voteCount
          collections {
            type
            name
          }
          attributes {
            source
            key
            value
          }
          metadataSource {
            key
            name
          }
        }
        languages {
          id
          name
        }
        videoResolution
        videoSource
      }
      aggregations {
        contentType {
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
        genre {
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
        torrentSource {
          value
          label
          count
          isEstimate
        }
        torrentTag {
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
        videoResolution {
          value
          label
          count
          isEstimate
        }
        videoSource {
          value
          label
          count
          isEstimate
        }
      }
    }
  }
}
`;

export const TORRENT_FILES_QUERY = `
query TorrentFiles($input: TorrentFilesQueryInput!) {
  torrent {
    files(input: $input) {
      totalCount
      hasNextPage
      items {
        infoHash
        index
        path
        size
        fileType
        createdAt
        updatedAt
      }
    }
  }
}
`;

export const TORRENT_SUGGEST_TAGS_QUERY = `
query TorrentSuggestTags($input: SuggestTagsQueryInput!) {
  torrent {
    suggestTags(input: $input) {
      suggestions {
        name
        count
      }
    }
  }
}
`;

export const TORRENT_DELETE_MUTATION = `
mutation TorrentDelete($infoHashes: [Hash20!]!) {
  torrent {
    delete(infoHashes: $infoHashes)
  }
}
`;

export const TORRENT_PUT_TAGS_MUTATION = `
mutation TorrentPutTags($infoHashes: [Hash20!]!, $tagNames: [String!]!) {
  torrent {
    putTags(infoHashes: $infoHashes, tagNames: $tagNames)
  }
}
`;

export const TORRENT_SET_TAGS_MUTATION = `
mutation TorrentSetTags($infoHashes: [Hash20!]!, $tagNames: [String!]!) {
  torrent {
    setTags(infoHashes: $infoHashes, tagNames: $tagNames)
  }
}
`;

export const TORRENT_DELETE_TAGS_MUTATION = `
mutation TorrentDeleteTags($infoHashes: [Hash20!], $tagNames: [String!]) {
  torrent {
    deleteTags(infoHashes: $infoHashes, tagNames: $tagNames)
  }
}
`;

export const TORRENT_REPROCESS_MUTATION = `
mutation TorrentReprocess($input: TorrentReprocessInput!) {
  torrent {
    reprocess(input: $input)
  }
}
`;

export const QUEUE_JOBS_QUERY = `
query QueueJobs($input: QueueJobsQueryInput!) {
  queue {
    jobs(input: $input) {
      totalCount
      hasNextPage
      items {
        id
        queue
        status
        payload
        priority
        retries
        maxRetries
        runAfter
        ranAt
        error
        createdAt
      }
      aggregations {
        queue {
          value
          label
          count
        }
        status {
          value
          label
          count
        }
      }
    }
  }
}
`;

export const QUEUE_PURGE_JOBS_MUTATION = `
mutation QueuePurgeJobs($input: QueuePurgeJobsInput!) {
  queue {
    purgeJobs(input: $input)
  }
}
`;

export const QUEUE_ENQUEUE_REPROCESS_BATCH_MUTATION = `
mutation QueueEnqueueReprocessTorrentsBatch($input: QueueEnqueueReprocessTorrentsBatchInput!) {
  queue {
    enqueueReprocessTorrentsBatch(input: $input)
  }
}
`;
