import{useEffect}from"react";
import{Html5QrcodeScanner}from"html5-qrcode";

function BarcodeScanner({onScan}){
    useEffect(()=>{
        const scanner=new Html5QrcodeScanner(
            "reader",
            {
                fps:10,
                qrbox:{width:250,height:150},
                aspectRatio:1.0
            },
            false
        );

        scanner.render(
            (decodedText)=>{
                onScan(decodedText);
                scanner.clear();
            },
            (error)=>{
            }
        );
        return()=>{
            scanner.clear().catch(error=>console.error("Failed to clear scanner",error));
        };
    },[]);
    
    return(
        <div style={{margin:"20px 0"}}>
            <div id="reader" width="100%"></div>
            <p>バーコードをカメラにかざしてください</p>
        </div>
    );
}

export default BarcodeScanner;