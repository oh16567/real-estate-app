import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props){
    super(props);
    this.state = { hasError:false, info:"" };
  }
  static getDerivedStateFromError(error){
    return { hasError:true };
  }
  componentDidCatch(error, info){
    console.error("[ErrorBoundary]", error, info);
    this.setState({ info: (error && (error.stack || error.message)) || String(error) });
  }
  render(){
    if (this.state.hasError){
      return (
        <div style={{padding:12, border:"1px solid #fca5a5", background:"#fff1f2", borderRadius:8}}>
          <h3 style={{marginTop:0,color:"#b91c1c"}}>런타임 에러가 발생했습니다.</h3>
          <div style={{whiteSpace:"pre-wrap", fontFamily:"monospace", fontSize:12}}>{this.state.info}</div>
          <p style={{fontSize:12, color:"#374151"}}>브라우저를 <b>Shift+F5</b>로 새로고침해도 계속되면 이 메시지를 캡처해 알려주세요.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
