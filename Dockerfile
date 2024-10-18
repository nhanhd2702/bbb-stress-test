FROM node:16-bullseye as core

# Update and install necessary packages
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && apt-get update \
    && apt-get install -y fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
      --no-install-recommends \
    && wget -O google-chrome-unstable.deb https://dl.google.com/linux/direct/google-chrome-unstable_current_amd64.deb \
    && dpkg -i google-chrome-unstable.deb || apt-get -f install -y \
    && rm -rf /var/lib/apt/lists/* google-chrome-unstable.deb

COPY ./docker/files/usr/local/bin/entrypoint /usr/local/bin/entrypoint

# Set permissions for the /etc/passwd file
RUN chmod g=u /etc/passwd

ENTRYPOINT [ "/usr/local/bin/entrypoint" ]

# Set a non-root user
ARG DOCKER_USER=1000
USER ${DOCKER_USER}

CMD ["google-chrome-unstable"]

# ---- Development image ----
FROM core as development

CMD ["/bin/bash"]

# ---- Distribution image ----
FROM core as dist

# Switch back to the root user to install dependencies
USER root:root

COPY . /app/
WORKDIR /app/

# Skip downloading Chromium from Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

RUN yarn install --frozen-lockfile

# Set a non-root user
ARG DOCKER_USER=1000
USER ${DOCKER_USER}

CMD ["./cli.js", "stress", "--no-sandbox"]