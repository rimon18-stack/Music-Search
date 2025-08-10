const SEARCH_URL = "https://music.youtube.com/youtubei/v1/search?prettyPrint=false";
const REEL_URL = "https://youtubei.googleapis.com/youtubei/v1/reel/reel_item_watch?prettyPrint=false";

async function handleRequest(request) {
    try {
        const url = new URL(request.url);
        const query = url.searchParams.get('s');
        
        if (!query) {
            return new Response(JSON.stringify({ error: 'Missing "s" query parameter' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }

        // Perform search
        const searchResults = await performSearch(query);
        
        // Get audio URLs for each result
        const resultsWithAudio = await Promise.all(
            searchResults.map(async result => {
                const audioUrl = await getAudioUrl(result.videoId);
                return { ...result, audioUrl };
            })
        );

        return new Response(JSON.stringify(resultsWithAudio, null, 2), {
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        };
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        };
    }
}

async function performSearch(query) {
    const payload = {
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

    const response = await fetch(SEARCH_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error('Search request failed');
    }

    const data = await response.json();
    const results = [];

    if (data?.contents?.tabbedSearchResultsRenderer?.tabs) {
        for (const tab of data.contents.tabbedSearchResultsRenderer.tabs) {
            const contents = tab.tabRenderer?.content?.sectionListRenderer?.contents || [];
            for (const content of contents) {
                if (content?.musicShelfRenderer?.contents) {
                    for (const item of content.musicShelfRenderer.contents) {
                        const renderer = item.musicResponsiveListItemRenderer;
                        if (renderer) {
                            const videoId = renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
                            const title = renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
                            
                            // Get largest thumbnail
                            const thumbs = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
                            const thumbnailUrl = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : null;

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
    const payload = {
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

    const response = await fetch(`${REEL_URL}&t=riUEGqBDXp3h&id=${videoId}&$fields=playerResponse`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        return null;
    }

    const data = await response.json();
    
    if (data?.playerResponse?.streamingData?.adaptiveFormats) {
        // First try to find audio/mp4; codecs="mp4a.40.5"
        const mp4a40_5 = data.playerResponse.streamingData.adaptiveFormats.find(
            format => format.mimeType?.includes('audio/mp4; codecs="mp4a.40.5"')
        );
        if (mp4a40_5) return mp4a40_5.url;
        
        // Fallback to any audio format
        const anyAudio = data.playerResponse.streamingData.adaptiveFormats.find(
            format => format.mimeType?.includes('audio/')
        );
        if (anyAudio) return anyAudio.url;
    }

    return null;
}

export default {
    fetch: handleRequest
};
