// FAQ site configuration. Update the URLs after deploying the Lambdas.
// See lambdas/README.md for setup instructions.

window.FAQ_CONFIG = {
    // Lambda Function URL for reading content (GET).
    getFaqsUrl: 'https://lmdxiepmwkh7izywhhfedzidre0jbinr.lambda-url.us-east-1.on.aws/',

    // Lambda Function URL for writing content + uploading images (POST, password-gated).
    putFaqsUrl: 'https://yobssnbhxmk6pb5tuxnskr35uu0gcrwt.lambda-url.us-east-1.on.aws/',

    // Public S3 URL prefix where uploaded images live. Used to render images
    // in answers if you ever need to rewrite paths. Currently informational.
    imagesBaseUrl: 'https://gratitude-faqs-content.s3.amazonaws.com/articles/',

    // Cache the fetched FAQ JSON in localStorage for this many milliseconds.
    // Set to 0 to disable client-side caching.
    cacheTtlMs: 5 * 60 * 1000
};
