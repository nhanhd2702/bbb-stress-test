const puppeteer = require("puppeteer");
const _ = require("lodash/fp");
const username = require("./username");

const initClient = async (
  browser,
  logger,
  joinUrl,
  webcam = false
) => {
  const page = await browser.newPage();
  await page.goto(joinUrl);

  // Increase default timeout
  const defaultTimeout = 60000; // 60 seconds

  // Attempt to click on "Listen only" button
  async function selectAudioOption(retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        logger.debug(`Attempt ${i + 1}: waiting for audio prompt (Listen only)`);
        // Use broader range of selectors to account for changes in UI
        await page.waitForSelector(`[aria-label="Listen only"],[class*="audio"]`, { timeout: defaultTimeout });
        
        logger.debug("Clicking on Listen only button");
        const listenOnlyButton = await page.$(`[aria-label="Listen only"],[class*="audio"]`);
        if (listenOnlyButton !== null) {
          await listenOnlyButton.click();
          logger.debug("Clicked on Listen only successfully");
          return true;
        }
      } catch (err) {
        logger.debug(`Listen only button not found after attempt ${i + 1}`);
      }
    }
    // Log the page's HTML for troubleshooting if Listen only button is not found
    logger.error("Listen only button did not appear after multiple attempts. Logging page HTML for troubleshooting.");
    const pageHtml = await page.content();
    logger.debug(`Page HTML: ${pageHtml}`);

    return false;
  }

  const audioOptionSelected = await selectAudioOption();
  if (!audioOptionSelected) {
    logger.error("Failed to select audio option. Skipping audio selection.");
    return Promise.reject(new Error("Failed to select audio option"));
  }

  // Bypass microphone test
  logger.debug("Bypassing microphone test.");

  // Wait for the overlay to be hidden
  logger.debug("Waiting for overlay to be hidden");
  try {
    await page.waitForSelector(".ReactModal__Overlay", { hidden: true, timeout: defaultTimeout });
    logger.debug("Overlay is hidden");
  } catch (err) {
    logger.error("Overlay did not hide. Trying to close any visible modals manually.");
    // Attempt to close any visible modals directly
    await page.evaluate(() => {
      const modalCloseButtons = document.querySelectorAll('.ReactModal__Overlay [aria-label="Close"]');
      modalCloseButtons.forEach(button => button.click());
    });
  }

  // Ensure that we are not muted
  logger.debug("Ensure that we are not muted...");

  // Retry logic for finding the mute/unmute button as before
  async function findMuteButton(retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        logger.debug(`Attempt ${i + 1}: waiting for Mute/Unmute button`);
        await page.waitForSelector(
          '[aria-label="Mute"],[aria-label="Unmute"],[aria-label="Audio"],[class*="mute"]',
          { timeout: defaultTimeout }
        );

        const muteButton = await page.$('[aria-label="Mute"],[aria-label="Unmute"],[aria-label="Audio"],[class*="mute"]');
        if (muteButton !== null) {
          logger.debug("Clicking on mute/unmute button");
          await muteButton.click();
          return true;
        }
      } catch (err) {
        logger.debug(`Mute/Unmute button not found after attempt ${i + 1}`);
      }
    }

    // Log the page's HTML for debugging
    logger.error("Mute/Unmute button did not appear after multiple attempts. Logging page HTML for troubleshooting.");
    const pageHtml = await page.content();
    logger.debug(`Page HTML: ${pageHtml}`);

    return false;
  }

  // Retry finding the Mute/Unmute button
  const muteButtonFound = await findMuteButton();
  if (!muteButtonFound) {
    logger.debug("Skipping Mute/Unmute step since button was not found.");
  }

  if (webcam) {
    await page.waitForSelector('[aria-label="Share webcam"]', { timeout: defaultTimeout });
    await page.click('[aria-label="Share webcam"]');
    logger.debug("Clicked on sharing webcam");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await page.waitForSelector("#setCam > option", { timeout: defaultTimeout });
    await page.waitForSelector('[aria-label="Start sharing"]', { timeout: defaultTimeout });
    logger.debug("Clicking on start sharing");
    await page.click('[aria-label="Start sharing"]');
  }

  return Promise.resolve(page);
};

const generateClientConfig = (webcam = false, microphone = false) => {
  return {
    username: username.getRandom(),
    webcam,
    microphone,
  };
};

async function start(
  bbbClient,
  logger,
  meetingID,
  testDuration,
  clientWithCamera,
  clientWithMicrophone,
  clientListening
) {
  const [browser, meetingPassword] = await Promise.all([
    puppeteer.launch({
      executablePath: "google-chrome-unstable",
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--mute-audio",
      ],
    }),
    bbbClient.getModeratorPassword(meetingID),
  ]);

  const clientsConfig = [
    ...[...Array(clientWithCamera)].map(() => generateClientConfig(true, true)),
    ...[...Array(clientWithMicrophone)].map(() =>
      generateClientConfig(false, true)
    ),
    ...[...Array(clientListening)].map(() =>
      generateClientConfig(false, false)
    ),
  ];

  for (let idx = 0; idx < clientsConfig.length; idx++) {
    logger.info(`${clientsConfig[idx].username} join the conference`);
    await initClient(
      browser,
      logger,
      bbbClient.getJoinUrl(
        clientsConfig[idx].username,
        meetingID,
        meetingPassword
      ),
      clientsConfig[idx].webcam,
      clientsConfig[idx].microphone
    ).catch((err) => {
      logger.error(
        `Unable to initialize client ${clientsConfig[idx].username} : ${err}`
      );
      Promise.resolve(null);
    });
  }

  logger.info("All user joined the conference");
  logger.info(`Sleeping ${testDuration}s`);
  await new Promise((resolve) => setTimeout(resolve, testDuration * 1000));
  logger.info("Test finished");
  return browser.close();
}

module.exports = {
  start,
};
