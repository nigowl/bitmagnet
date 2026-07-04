package media

import (
	"context"
	"encoding/json"
	"strings"
)

func (s *service) playerTransmissionLoadSession(
	ctx context.Context,
	settings playerBootstrapSettings,
) (playerTransmissionRPCSessionResponse, error) {
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
		return playerTransmissionRPCSessionResponse{}, err
	}

	var response playerTransmissionRPCSessionResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return playerTransmissionRPCSessionResponse{}, err
	}
	if err := playerTransmissionRPCResultError("session-get", response.Result); err != nil {
		return playerTransmissionRPCSessionResponse{}, err
	}
	return response, nil
}

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
	if err := playerTransmissionRPCResultError("torrent-get", response.Result); err != nil {
		return nil, err
	}
	return response.Arguments.Torrents, nil
}

func (s *service) playerTransmissionLoadFreeSpace(
	ctx context.Context,
	settings playerBootstrapSettings,
) (int64, error) {
	response, err := s.playerTransmissionLoadSession(ctx, settings)
	if err != nil {
		return 0, err
	}
	return response.Arguments.DownloadDirFreeSpace, nil
}

func (s *service) playerTransmissionLoadSessionDirs(
	ctx context.Context,
	settings playerBootstrapSettings,
) ([]string, error) {
	response, err := s.playerTransmissionLoadSession(ctx, settings)
	if err != nil {
		return nil, err
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
	if err := playerTransmissionRPCResultError("torrent-remove", response.Result); err != nil {
		return err
	}
	return nil
}
