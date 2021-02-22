import React, { Component } from 'react'
import { withRouter, Redirect, Link } from 'react-router-dom'
import { fitShow } from '../../api/fits'
import apiUrl from '../../apiConfig'
import axios from 'axios'
import Image from 'react-bootstrap/Image'
import Button from 'react-bootstrap/Button'

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
    // let fitJsx
    // const { msgAlert, user } = this.props
    const { fit, deleted } = this.state

    if (deleted) {
      return <Redirect to="/fits"/>
    }
    // if we don't have a fit yet
    if (!fit) {
      return (
        <div>
          <h2>GO MAKE A FIT!</h2>
        </div>
      )
    }

    return (
      <div className="showFitDiv mx-auto">
        <h3 className='fitEdit'>{fit.name}</h3>
        <h3 className='openType'>{fit.brand}</h3>
        <h3 className='openType'>{fit.site}</h3>
        <Image src={fit.photo}/>
        <Button
          onClick={this.deleteFit}
          type="submit"
          variant="primary"
        >
          DELETE
        </Button>
        <Button
          type="submit"
          variant="primary"
        >
          <Link to={`/fits/${fit.id}/edit`}>UPDATE</Link></Button>
      </div>
    )
  }
}

export default withRouter(FitShow)
