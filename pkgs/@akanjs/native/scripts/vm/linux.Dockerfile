# akan-native: a Linux desktop build and test environment (docs/testing-windows-linux.md).
# Ubuntu 24.04 with WebKitGTK 4.1, the X virtual framebuffer for windows without a display, a
# D-Bus session, gnome-keyring (Secret Service) and dunst (a notification server, D-Bus activated
# for local-notifications), xdotool and ImageMagick (clicks and screenshots on the virtual display),
# rustup without a toolchain (akan-native pins one through native/desktop/rust-toolchain.toml) and Bun.
# scripts/vm/linux.ts builds and uses it.
FROM ubuntu:24.04

ARG BUN_VERSION=1.4.2
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential pkg-config curl ca-certificates unzip xz-utils rsync git \
      libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev \
      xvfb xauth dbus-x11 gnome-keyring libsecret-tools at-spi2-core dunst \
      fonts-dejavu-core fonts-noto-cjk xdg-utils desktop-file-utils \
      xdotool imagemagick \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash akan-native
USER akan-native
WORKDIR /home/akan-native

RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --default-toolchain none --profile minimal \
    && curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
ENV PATH=/home/akan-native/.bun/bin:/home/akan-native/.cargo/bin:$PATH
# Mount points of scripts/vm/linux.ts's volumes, so that Docker creates them owned by akan-native.
RUN mkdir -p /home/akan-native/work /home/akan-native/.cargo/registry /home/akan-native/.akan/native
