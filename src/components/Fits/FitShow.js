import React, { Component } from 'react'
import { withRouter, Redirect, Link } from 'react-router-dom'
import { fitShow } from '../../api/fits'
import apiUrl from '../../apiConfig'
import axios from 'axios'

class FitShow extends Component {
  constructor (props) {
    super(props)

    // initially our fit state will be null, until it is fetched from the api
    this.state = {
      fit: null,
      deleted: false
    }
  }

  componentDidMount () {
    const { user, match, msgAlert } = this.props
    console.log('is this working', user)
    console.log(match)
    // make a request for a single fit
    fitShow(match.params.id, user)
    // set the fit state to the fit we got back in the resopnse's data
      .then(res => this.setState({ fit: res.data.fit }))
      .then(() => msgAlert({
        heading: 'Showing fit Successfully',
        message: 'The fit is now displayed.',
        variant: 'success'
      }))
      .catch(error => {
        msgAlert({
          heading: 'Showing fit Failed',
          message: 'Failed to show fit with error: ' + error.message,
          variant: 'danger'
        })
      })
  }

  deleteFit = () => {
    const { user, match } = this.props
    console.log(user)
    console.log(match)
    axios({
      url: `${apiUrl}/fits/${match.params.id}`,
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${user.token}`
      }
    })
      .then(() => {
        this.setState({ deleted: true })
      })
      .catch(console.error)
  }

  render () {
    let fitJsx
    const { msgAlert, user } = this.props
    const { fit, deleted } = this.state

    if (deleted) {
      return <Redirect to="/fits"/>
    }
    // if we don't have a fit yet
    if (!fit) {
      return (
        <div>
          <h2>There are no fits! Go make one.</h2>
        </div>
      )
    }

    return (
      <div className="showFitDiv">
        <h3 className='fitEdit'>{fit.name}</h3>
        <h3 className='openType'>{fit.brand}</h3>
        <h3 className='openType'>{fit.site}</h3>
        <button onClick={this.deleteFit} className='submitBtn'>Delete fit</button><button className='submitBtn'><Link to={`/fits/${fit._id}`}>Update fit</Link></button>
        <FitShow msgAlert={msgAlert} user={user}/>
        <div>
          <h3>HELLO?</h3>
        </div>
        {deleted ? <Redirect to="/fits"/> : fitJsx}
      </div>
    )
  }
}

export default withRouter(FitShow)
