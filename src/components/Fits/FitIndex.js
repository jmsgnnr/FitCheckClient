import React, { Component } from 'react'
import { Link } from 'react-router-dom'
import { fitIndex } from '../../api/fits'

class FitIndex extends Component {
  constructor (props) {
    super(props)

    // keep track of the fits in our application
    // initially they will be null until we have fetched them from the api
    this.state = {
      fits: []
    }
  }

  // after we render the fitIndex component for the first time
  componentDidMount () {
    const { msgAlert, user } = this.props
    // make a request to get all of our fits
    // console.log('han is here line 20', this.props)
    fitIndex(user)
      // set the fits state, to the fits we got back in the response's data
      .then(res => {
        this.setState({ fits: res.data.fits })
        // console.log('james made it here', this.state.fits)
      })
      // dummy data until we create actual fits
      // .then(res => this.setState({ fits: [{ _id: 1, name: 'jaws' }, { _id: 2, name: 'The Phantom Menace' }] }))
      .then(() => msgAlert({
        heading: 'ZANDER WAS HERE',
        message: 'All fits retrieved. Click on one to go to its page.',
        variant: 'success'
      }))
      .catch(error => {
        msgAlert({
          heading: 'ZANDER WAS NOT HERE',
          message: 'Could not load fits with error: ' + error.message,
          variant: 'danger'
        })
      })
  }

  render () {
    // destructure our fits state
    const { fits } = this.state
    // if we haven't fetched any fits yet from the API
    if (fits.length === 0) {
      return (
        <div>
          <h2>THIS IS THE CORRECT FITS PAGE</h2>
        </div>
      )
    }

    const fitJsx = fits.map(fit => (
      <Link to={`/fits/${fit._id}`} key={fit._id}>
        <li>
          {fit.name}
        </li>
      </Link>
    ))

    return (
      <div className='fitDiv1'>
        <h3 className='createh3'>FITS</h3>
        <ul>
          {fitJsx}
        </ul>
      </div>
    )
  }
}

export default FitIndex
