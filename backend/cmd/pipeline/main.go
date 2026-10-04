// Command pipeline collects and prepares transit data for OpenTripPlanner.
//
// Usage:
//
//	pipeline fetch [-out dir]   download upstream sources into the raw data dir
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/bintangfabian/goRute/internal/pipeline"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	var err error
	switch os.Args[1] {
	case "fetch":
		err = fetch(ctx, logger, os.Args[2:])
	default:
		usage()
		os.Exit(2)
	}
	if err != nil {
		logger.Error("pipeline failed", "err", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: pipeline fetch [-out dir]")
}

func fetch(ctx context.Context, logger *slog.Logger, args []string) error {
	fs := flag.NewFlagSet("fetch", flag.ExitOnError)
	out := fs.String("out", "../data/raw", "directory for downloaded files")
	if err := fs.Parse(args); err != nil {
		return err
	}

	client := &http.Client{Timeout: 5 * time.Minute}
	for _, src := range pipeline.Sources {
		logger.Info("downloading", "file", src.File, "url", src.URL)
		n, err := pipeline.Download(ctx, client, src, *out)
		if err != nil {
			return fmt.Errorf("%s: %w", src.File, err)
		}
		logger.Info("saved", "file", src.File, "bytes", n)
	}
	return nil
}
