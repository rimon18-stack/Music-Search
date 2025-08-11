const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.get('/', async (req, res) => {
  try {
    const query = req.query.s ? req.query.s.trim() : '';
    if (query === '') {
      return res.status(400).json({ error: 'Missing "s" query parameter' });
    }

    // Perform search
    const searchResults = await performSearch(query);
    
    // Get audio URLs for each result
    const resultsWithAudio = await Promise.all(
      searchResults.map(async (item) => {
        const audioUrl = await getAudioUrl(item.videoId);
        return {
          ...item,
          audioUrl
        };
      })
    );

    res.json(resultsWithAudio);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function performSearch(query) {
  const searchUrl = "https://music.youtube.com/youtubei/v1/search?prettyPrint=false";
  
  const searchPayload = {
    "context": {
      "client": {
        "clientName": "WEB_REMIX",
        "clientVersion": "1.20250407.01.00",
        "platform": "DESKTOP",
        "hl": "en",
        "gl": "US",
        "visitorData": "null",
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.3",
        "referer": "https://music.youtube.com/",
        "xClientName": 67
      },
      "request": {
        "internalExperimentFlags": [],
        "useSsl": true
      },
      "user": {
        "lockedSafetyMode": false
      }
    },
    "query": query,
    "params": "EgWKAQIIAWoKEAkQBRAKEAMQBA=="
  };

  const headers = {
    'User-Agent': 'ktor-client',
    'Content-Type': 'application/json',
    'x-goog-fieldmask': 'contents.tabbedSearchResultsRenderer.tabs.tabRenderer.content.sectionListRenderer.contents.musicShelfRenderer(continuations,contents.musicResponsiveListItemRenderer(flexColumns,fixedColumns,thumbnail,navigationEndpoint,badges))',
    'accept-charset': 'UTF-8',
    'Cookie': 'YSC=oMSBplkrasY; VISITOR_INFO1_LIVE=tLUM1eu1vqI; VISITOR_PRIVACY_METADATA=CgJCRBIEGgAgDg%3D%3D; __Secure-ROLLOUT_TOKEN=CLDu7bqCs72JfBDf7_f4leWOAxjf7_f4leWOAw%3D%3D'
  };

  const response = await axios.post(searchUrl, searchPayload, { headers });
  const searchData = response.data;

  const results = [];
  if (searchData.contents?.tabbedSearchResultsRenderer?.tabs) {
    for (const tab of searchData.contents.tabbedSearchResultsRenderer.tabs) {
      const contents = tab.tabRenderer?.content?.sectionListRenderer?.contents || [];
      for (const content of contents) {
        if (content.musicShelfRenderer?.contents) {
          for (const item of content.musicShelfRenderer.contents) {
            const renderer = item.musicResponsiveListItemRenderer;
            if (renderer) {
              const videoId = renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
              const title = renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;

              // Get largest thumbnail
              const thumbs = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
              let thumbnailUrl = null;
              if (thumbs.length > 0) {
                const lastThumb = thumbs[thumbs.length - 1];
                thumbnailUrl = lastThumb.url;
              }

              if (videoId && title) {
                results.push({
                  videoId,
                  title,
                  thumbnail: thumbnailUrl
                });
              }
            }
          }
        }
      }
    }
  }

  return results;
}

async function getAudioUrl(videoId) {
  const reelUrl = `https://youtubei.googleapis.com/youtubei/v1/reel/reel_item_watch?prettyPrint=false&t=riUEGqBDXp3h&id=${videoId}&\$fields=playerResponse`;
  
  const reelPayload = {
    "context": {
      "request": {
        "internalExperimentFlags": [],
        "useSsl": true
      },
      "client": {
        "androidSdkVersion": 35,
        "utcOffsetMinutes": 0,
        "osVersion": "15",
        "hl": "en-GB",
        "clientName": "ANDROID",
        "gl": "GB",
        "clientScreen": "WATCH",
        "clientVersion": "19.28.35",
        "osName": "Android",
        "platform": "MOBILE",
        "visitorData": "null"
      },
      "user": {
        "lockedSafetyMode": false
      }
    },
    "playerRequest": {
      "cpn": "gENa2eUbKdpoJYOF",
      "contentCheckOk": true,
      "racyCheckOk": true,
      "videoId": videoId
    },
    "disablePlayerResponse": false
  };

  const headers = {
    'User-Agent': 'com.google.android.youtube/19.28.35 (Linux; U; Android 15; GB) gzip',
    'Accept-Encoding': 'gzip',
    'Content-Type': 'application/json',
    'x-goog-api-format-version': '2',
    'accept-language': 'en-GB, en;q=0.9'
  };

  try {
    const response = await axios.post(reelUrl, reelPayload, { headers });
    const reelData = response.data;

    if (reelData.playerResponse?.streamingData?.adaptiveFormats) {
      // First try to find audio/mp4; codecs="mp4a.40.5"
      const mp4aFormat = reelData.playerResponse.streamingData.adaptiveFormats.find(
        format => format.mimeType?.includes('audio/mp4; codecs="mp4a.40.5"')
      );
      if (mp4aFormat?.url) return mp4aFormat.url;
      
      // If not found, try to find any audio format
      const audioFormat = reelData.playerResponse.streamingData.adaptiveFormats.find(
        format => format.mimeType?.includes('audio/')
      );
      if (audioFormat?.url) return audioFormat.url;
    }
  } catch (error) {
    console.error('Error getting audio URL:', error);
    return null;
  }

  return null;
}

module.exports = app;
