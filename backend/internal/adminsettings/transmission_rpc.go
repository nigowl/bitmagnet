package adminsettings

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

func transmissionRPCResultError(method, result string) error {
	result = strings.TrimSpace(result)
	if strings.EqualFold(result, "success") {
		return nil
	}
	return fmt.Errorf("transmission %s result=%q", method, result)
}

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
	if err := transmissionRPCResultError("torrent-get", response.Result); err != nil {
		return nil, err
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
	if err := transmissionRPCResultError("session-get", response.Result); err != nil {
		return 0, err
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
	if err := transmissionRPCResultError("torrent-remove", response.Result); err != nil {
		return err
	}
	return nil
}
