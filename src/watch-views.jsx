// Single lazy barrel for route-specific views. Everything here is only
// rendered on watch/person/adult/search routes, so keeping them in one
// dynamic chunk keeps the homepage bundle — and its throttled evaluation,
// which simulated LCP waits behind — as small as possible.
export {TrailerPlayer} from './TrailerPlayer.jsx';
export {MovieDetails} from './MovieDetails.jsx';
export {SimilarMovies} from './SimilarMovies.jsx';
export {TrailerVersions} from './TrailerVersions.jsx';
export {PlaybackQueue} from './PlaybackQueue.jsx';
export {PersonPage} from './PersonPage.jsx';
export {PeopleSearchResults} from './PeopleSearchResults.jsx';
export {AdultArea} from './AdultArea.jsx';
