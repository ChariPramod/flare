#!/usr/bin/env bash
# Source from host launchers. Docker Desktop's user install may not be on the
# PATH inherited by an already-running terminal or desktop app.
if [[ "$(uname -s)" == Darwin ]]; then
  for flare_docker_bin in "${HOME:-}/.docker/bin" /Applications/Docker.app/Contents/Resources/bin; do
    [[ -d "$flare_docker_bin" ]] || continue
    case ":$PATH:" in
      *":$flare_docker_bin:"*) ;;
      *) export PATH="$PATH:$flare_docker_bin" ;;
    esac
  done
  unset flare_docker_bin
fi
