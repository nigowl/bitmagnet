package adminsettings

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

func (s *service) loadTransmissionTaskItems(
	ctx context.Context,
	cfg TransmissionSettings,
) ([]transmissionTorrentItem, error) {
	payload, _ := json.Marshal(transmissionTorrentRequest{
		Method: "torrent-get",
		Arguments: transmissionTorrentRequestArgs{
			Fields: []string{
				"id",
				"hashString",
				"name",
				"status",
				"error",
				"percentDone",
				"rateDownload",
				"rateUpload",
				"leftUntilDone",
				"sizeWhenDone",
				"addedDate",
				"activityDate",
				"isFinished",
				"downloadDir",
				"errorString",
			},
		},
	})
	responseBytes, err := callTransmissionRPCWithSession(
		ctx,
		cfg.URL,
		cfg.Username,
		cfg.Password,
		cfg.InsecureTLS,
		cfg.TimeoutSeconds,
		payload,
	)
	if err != nil {
		return nil, err
	}

	var response transmissionTorrentResponse
	if err := json.Unmarshal(responseBytes, &response); err != nil {
		return nil, err
	}
	if !strings.EqualFold(strings.TrimSpace(response.Result), "success") {
		return nil, fmt.Errorf("transmission torrent-get result=%q", strings.TrimSpace(response.Result))
	}
	return response.Arguments.Torrents, nil
}

func (s *service) loadTransmissionFreeSpace(ctx context.Context, cfg TransmissionSettings) (int64, error) {
	payload, _ := json.Marshal(transmissionTorrentRequest{
		Method: "session-get",
	})
	responseBytes, err := callTransmissionRPCWithSession(
		ctx,
		cfg.URL,
		cfg.Username,
		cfg.Password,
		cfg.InsecureTLS,
		cfg.TimeoutSeconds,
		payload,
	)
	if err != nil {
		return 0, err
	}
	var response transmissionSessionResponse
	if err := json.Unmarshal(responseBytes, &response); err != nil {
		return 0, err
	}
	if !strings.EqualFold(strings.TrimSpace(response.Result), "success") {
		return 0, fmt.Errorf("transmission session-get result=%q", strings.TrimSpace(response.Result))
	}
	return response.Arguments.DownloadDirFreeSpace, nil
}

func (s *service) removeTransmissionTasks(
	ctx context.Context,
	cfg TransmissionSettings,
	ids []int64,
) error {
	if len(ids) == 0 {
		return nil
	}
	payload, _ := json.Marshal(transmissionTorrentRequest{
		Method: "torrent-remove",
		Arguments: transmissionTorrentRequestArgs{
			IDs:             ids,
			DeleteLocalData: boolPtr(true),
		},
	})
	responseBytes, err := callTransmissionRPCWithSession(
		ctx,
		cfg.URL,
		cfg.Username,
		cfg.Password,
		cfg.InsecureTLS,
		cfg.TimeoutSeconds,
		payload,
	)
	if err != nil {
		return err
	}
	var response transmissionTorrentResponse
	if err := json.Unmarshal(responseBytes, &response); err != nil {
		return err
	}
	if !strings.EqualFold(strings.TrimSpace(response.Result), "success") {
		return fmt.Errorf("transmission torrent-remove result=%q", strings.TrimSpace(response.Result))
	}
	return nil
}
