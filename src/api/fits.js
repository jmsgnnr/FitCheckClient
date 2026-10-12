import apiUrl from '../apiConfig'
import axios from 'axios'
import {
  buildFitIndexOptions,
  buildFitCreateOptions,
  buildFitShowOptions
} from './requestContracts'

export const fitIndex = user => {
  return axios(buildFitIndexOptions(apiUrl, user))
}

export const fitCreate = (fit, user) => {
  return axios(buildFitCreateOptions(apiUrl, fit, user))
}

export const fitShow = (id, user) => {
  return axios(buildFitShowOptions(apiUrl, id, user))
}
