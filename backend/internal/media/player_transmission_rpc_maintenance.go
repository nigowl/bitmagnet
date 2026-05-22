package media

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

func (s *service) playerTransmissionLoadAllTorrents(
	ctx context.Context,
	settings playerBootstrapSettings,
) ([]playerTransmissionRPCTorrent, error) {
	payload, _ := json.Marshal(playerTransmissionRPCRequest{
		Method: "torrent-get",
		Arguments: playerTransmissionRPCArguments{
			Fields: []string{
				"id",
				"hashString",
				"name",
				"status",
				"percentDone",
				"rateDownload",
				"rateUpload",
				"error",
				"errorString",
				"leftUntilDone",
				"sizeWhenDone",
				"addedDate",
				"activityDate",
				"isFinished",
			},
		},
	})
	raw, err := callTransmissionRPC(
		ctx,
		settings.TransmissionURL,
		settings.TransmissionUsername,
		settings.TransmissionPassword,
		settings.TransmissionInsecureTLS,
		settings.TransmissionTimeoutSeconds,
		payload,
	)
	if err != nil {
		return nil, err
	}
	var response playerTransmissionRPCResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, err
	}
	if !strings.EqualFold(strings.TrimSpace(response.Result), "success") {
		return nil, fmt.Errorf("transmission torrent-get result=%q", strings.TrimSpace(response.Result))
	}
	return response.Arguments.Torrents, nil
}

func (s *service) playerTransmissionLoadFreeSpace(
	ctx context.Context,
	settings playerBootstrapSettings,
) (int64, error) {
	payload, _ := json.Marshal(playerTransmissionRPCRequest{
		Method: "session-get",
	})
	raw, err := callTransmissionRPC(
		ctx,
		settings.TransmissionURL,
		settings.TransmissionUsername,
		settings.TransmissionPassword,
		settings.TransmissionInsecureTLS,
		settings.TransmissionTimeoutSeconds,
		payload,
	)
	if err != nil {
		return 0, err
	}
	var response playerTransmissionRPCSessionResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return 0, err
	}
	if !strings.EqualFold(strings.TrimSpace(response.Result), "success") {
		return 0, fmt.Errorf("transmission session-get result=%q", strings.TrimSpace(response.Result))
	}
	return response.Arguments.DownloadDirFreeSpace, nil
}

func (s *service) playerTransmissionLoadSessionDirs(
	ctx context.Context,
	settings playerBootstrapSettings,
) ([]string, error) {
	payload, _ := json.Marshal(playerTransmissionRPCRequest{
		Method: "session-get",
	})
	raw, err := callTransmissionRPC(
		ctx,
		settings.TransmissionURL,
		settings.TransmissionUsername,
		settings.TransmissionPassword,
		settings.TransmissionInsecureTLS,
		settings.TransmissionTimeoutSeconds,
		payload,
	)
	if err != nil {
		return nil, err
	}
	var response playerTransmissionRPCSessionResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, err
	}
	if !strings.EqualFold(strings.TrimSpace(response.Result), "success") {
		return nil, fmt.Errorf("transmission session-get result=%q", strings.TrimSpace(response.Result))
	}

	dirs := make([]string, 0, 2)
	if downloadDir := strings.TrimSpace(response.Arguments.DownloadDir); downloadDir != "" {
		dirs = append(dirs, downloadDir)
	}
	if response.Arguments.IncompleteDirEnabled {
		if incompleteDir := strings.TrimSpace(response.Arguments.IncompleteDir); incompleteDir != "" {
			dirs = append(dirs, incompleteDir)
		}
	}
	return dirs, nil
}

func (s *service) playerTransmissionRemoveTorrents(
	ctx context.Context,
	settings playerBootstrapSettings,
	ids []int64,
) error {
	if len(ids) == 0 {
		return nil
	}
	idValues := make([]any, 0, len(ids))
	for _, id := range ids {
		idValues = append(idValues, id)
	}
	payload, _ := json.Marshal(playerTransmissionRPCRequest{
		Method: "torrent-remove",
		Arguments: playerTransmissionRPCArguments{
			IDs:             idValues,
			DeleteLocalData: boolPtr(true),
		},
	})
	raw, err := callTransmissionRPC(
		ctx,
		settings.TransmissionURL,
		settings.TransmissionUsername,
		settings.TransmissionPassword,
		settings.TransmissionInsecureTLS,
		settings.TransmissionTimeoutSeconds,
		payload,
	)
	if err != nil {
		return err
	}
	var response playerTransmissionRPCResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return err
	}
	if !strings.EqualFold(strings.TrimSpace(response.Result), "success") {
		return fmt.Errorf("transmission torrent-remove result=%q", strings.TrimSpace(response.Result))
	}
	return nil
}
