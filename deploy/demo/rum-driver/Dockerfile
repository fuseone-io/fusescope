FROM mcr.microsoft.com/playwright:v1.59.1-noble
WORKDIR /app
RUN npm init -y >/dev/null && npm install --omit=dev playwright@1.59.1
COPY drive.cjs ./
USER pwuser
CMD ["node", "drive.cjs"]
