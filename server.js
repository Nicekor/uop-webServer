'use strict';

const express = require('express');
const app = express();
const imager = require('./imager/imager');

// start the server
const port = 8080;
app.listen(port, err => {
  if (err) {
    console.error('Error starting server', err);
  } else {
    console.log('Server running on port', port);
  }
});

// logging
app.use('/', (req, _, next) => {
  console.log(new Date(), req.method, req.url);
  next();
});

// serve static files
app.use('/', express.static('./public'));

// global variables
app.locals.recentPaths = [];
app.locals.recentSizes = [];
app.locals.recentTexts = [];
app.locals.topSizes = {};
app.locals.topReferrers = {};

// api
app.get(
  '/img/:width/:height',
  validateInputs,
  applyRecentPaths,
  applyRecentSizes,
  applyRecentTexts,
  applyTopSizes,
  applyTopReferrers,
  serveImage
);
app.get('/stats/paths/recent', serveRecentPaths);
app.get('/stats/sizes/recent', serveRecentSizes);
app.get('/stats/texts/recent', serveRecentTexts);
app.get('/stats/sizes/top', serveTopSizes);
app.get('/stats/referrers/top', serveTopReferrers);
app.delete('/stats', resetStats);

// api functions
async function serveImage(_, res) {
  try {
    await imager.sendImage(
      res,
      res.locals.params.width,
      res.locals.params.height,
      res.locals.queries.square,
      res.locals.queries.text
    );
  } catch (err) {
    error(res, 500, err);
  }
}

function serveRecentPaths(_, res) {
  try {
    res.json(app.locals.recentPaths);
  } catch (err) {
    error(res, 500, err);
  }
}

function serveRecentSizes(_, res) {
  try {
    res.json(app.locals.recentSizes);
  } catch (err) {
    error(res, 500, err);
  }
}

function serveRecentTexts(_, res) {
  try {
    res.json(app.locals.recentTexts);
  } catch (err) {
    error(res, 500, err);
  }
}

function serveTopSizes(_, res) {
  try {
    const topSizesList = Object.values(app.locals.topSizes)
      .sort((a, b) => b.n - a.n)
      .slice(0, 10);
    res.json(topSizesList);
  } catch (err) {
    error(res, 500, err);
  }
}

function serveTopReferrers(_, res) {
  try {
    const topReferrersList = Object.values(app.locals.topReferrers)
      .sort((a, b) => b.n - a.n)
      .slice(0, 10);
    res.json(topReferrersList);
  } catch (err) {
    error(res, 500, err);
  }
}

function resetStats(_, res) {
  try {
    app.locals.recentPaths = [];
    app.locals.recentSizes = [];
    app.locals.recentTexts = [];
    app.locals.topSizes = {};
    app.locals.topReferrers = {};
    res.sendStatus(200);
  } catch (err) {
    error(res, 500, err);
  }
}

// helper functions/middlewares
function validateInputs(req, res, next) {
  const width = +req.params.width;
  const height = +req.params.height;
  let square = req.query.square;
  const text = req.query.text === '+' ? ' ' : req.query.text;
  let dimensions = [width, height];
  if (square || square === '') {
    square = +req.query.square;
    dimensions.push(square);
  }

  const isTooBig = dimensions.some(size => size > 2000);
  if (isTooBig) {
    error(res, 403, 'Size is too big, it must be less than 2000');
    return;
  }

  const isValid = dimensions.every(size => size > 0 && Number.isInteger(size));
  if (!isValid) {
    error(
      res,
      400,
      'Dimension not valid, must be higher than zero and an integer'
    );
    return;
  }

  res.locals.params = { width, height };
  res.locals.queries = { square, text };
  next();
}

function applyRecentPaths(req, res, next) {
  const recentPaths = app.locals.recentPaths;

  const queriesStr = Object.keys(res.locals.queries)
    .filter(queryKey => res.locals.queries[queryKey])
    .map(
      queryKey =>
        `${queryKey}=${encodeURIComponent(res.locals.queries[queryKey])}`
    )
    .join('&');
  const questionMark = queriesStr ? '?' : '';
  const url = req.path + questionMark + queriesStr;
  recentPaths.unshift(url);

  const firstTenUniqueRecentPaths = [...new Set(recentPaths)].slice(0, 10);

  app.locals.recentPaths = firstTenUniqueRecentPaths;
  next();
}

function applyRecentSizes(_, res, next) {
  const recentSizes = app.locals.recentSizes;
  const sizes = {
    w: res.locals.params.width,
    h: res.locals.params.height
  };

  recentSizes.unshift(sizes);

  const uniqueRecentSizes = recentSizes.filter(
    (sizes, i) =>
      i ===
      recentSizes.findIndex(size => size.w === sizes.w && size.h === sizes.h)
  );

  app.locals.recentSizes = uniqueRecentSizes.slice(0, 10);
  next();
}

function applyRecentTexts(_, res, next) {
  const recentTexts = app.locals.recentTexts;
  const text = res.locals.queries.text;

  if (text) {
    recentTexts.unshift(text);
  }

  const firstTenUniqueRecentTexts = [...new Set(recentTexts)].slice(0, 10);

  app.locals.recentTexts = firstTenUniqueRecentTexts;
  next();
}

function applyTopSizes(_, res, next) {
  const { width, height } = res.locals.params;
  const topSizes = app.locals.topSizes;

  const sizeKey = `${width}x${height}`;
  if (!topSizes[sizeKey]) {
    topSizes[sizeKey] = {
      w: width,
      h: height,
      n: 0
    };
  }
  topSizes[sizeKey].n += 1;

  app.locals.topSizes = topSizes;
  next();
}

function applyTopReferrers(req, _, next) {
  const topReferrers = app.locals.topReferrers;

  const referrerKey = req.headers.referer;
  if (referrerKey) {
    if (!topReferrers[referrerKey]) {
      topReferrers[referrerKey] = {
        ref: referrerKey,
        n: 0
      };
    }
    topReferrers[referrerKey].n += 1;
  }

  app.locals.topReferrers = topReferrers;
  next();
}

function error(res, statusCode, errorMessage) {
  res.sendStatus(statusCode);
  console.error(errorMessage);
}