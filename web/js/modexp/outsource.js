// default servers to contact for the outsourcing method. For more information
// on how to run the servers, look at the server/ folder at the top folder.
const default_servers = "127.0.0.1:8000 127.0.0.1:8001 127.0.0.1:8002";

class OutsourceModExp extends ModExp {
    constructor(integers) {
        super(integers)
        // read the address of the servers
        this.servers = default_servers;
        if (this.servers.length < 2) {
            throw new Error("split mod exp can't use less than 2 servers");
        }
        var v1 = new BigInteger("1");
        this.modulo_1 = new BigInteger();
        this.mod.copyTo(this.modulo_1);
        // modulo - 1 for exponents
        this.modulo_1 = this.modulo_1.subtract(v1);
    }

    name() {
        return "remote computation - split secrets in n shares";
    }

    run(deferred) {
        // prepare the splitting
        // s = secret to share = exponent
        // create n-1 random numbers r_i
        // create last share r_n = s - SUM(r_i)
        var n = this.servers.length;
        var n_1 = n - 1;
        var splitCopies = new Array(this.copies);
        for (var i = 0; i < this.copies; i++) {
            splitCopies[i] = this.split();
            //log("SPLIT for i = " + i);
            //log(splitCopies[i]);
        }
        var modStr = this.mod.toString(16);
        var baseStr = this.base.toString(16);
        //log(this.getInfo());
        //log("modulo - 1 : " + this.modulo_1.toString(16));
        //log("Modexp - SPLIT : " + this.copies + " operations");
        var promises = [];
        for(const [i,server] of this.servers.entries()) {
            var url = "http://" + server + "/modexp/split";
            var modexps = new Array(this.copies);
            for(var j = 0; j < this.copies; j++) {
                var modexp = {
                    "base": baseStr,
                    "exp": splitCopies[j][i].toString(16)
                };
                modexps[j] = modexp
            }
            var data = {
                "modulo": modStr,
                "modexps": modexps,
            }
            //log("Requesting modexp at url " + url);
            //log(data);
            //log(JSON.stringify(data));
            promises.push($.ajax({
                type: "POST",
                url: url,
                crossDomain: true,
                data: JSON.stringify(data),
                contentType: "application/json",
                dataType: "json",
            }));
        }

        var that = this;
        $.when.apply($,promises).done(function() {
            var results = new Array(arguments.length);
            for(var i = 0; i < arguments.length; i++) {
                results[i] =  arguments[i][0].Results;
            }
            //log(results);
            that.aggregate(results);
            //log("splitmodexp - finish");
            deferred.resolve();
        })
        .fail(function(error) {
            log(error);
        });
    }

    split() {
       var n = this.servers.length;
       var n_1 = this.servers.length-1;
       var splits = new Array(n);
       var acc = new BigInteger("0");
       //log("Split mod demo:");
       for(var i = 0; i < n_1; i++) {
           splits[i] = randomInteger(this.modulo_1.bitLength()).mod(this.modulo_1);
           acc = acc.add(splits[i]).mod(this.modulo_1);
       };
       var last = new BigInteger("0");
       this.exp.copyTo(last);
       // r_n = s - SUM(r_i)
       splits[n_1] = last.subtract(acc).mod(this.modulo_1);
       //this.verifySplit(splits)
       return splits
    }

    aggregate(results) {
        for(var i = 0; i < this.copies;  i++) {
            var acc = new BigInteger("1");
            for(var j = 0; j < this.servers.length; j++) {
                // take the i'th response from the j's servers
                var r_i = new BigInteger(results[j][i],16);
                acc = acc.multiply(r_i).mod(this.mod);
                //log("-- Result["+ i + "] : " + data[0]);
                //log("-- acc = " + acc.toString(16));
            }
            //log("final result: " + acc.toString(16));
            //log("expected result : " + this.modexp().toString(16));
        }
        //log("SPlitModExp Aggregate done");
    }

    verifySplit(splits) {
        // just to check if we retrieve the same exponent after
        var res = new BigInteger("0");
        // res = SUM(r_i) + r_n = SUM(r_i) + s - SUM(r_i)
        var finalResult = new BigInteger("1");
        for(var i = 0; i < splits.length; i++ ) {
            // compute SUM(r_i)
            res = res.add(splits[i]).mod(this.modulo_1);
            // compute compute = base^r_i mod q
            var compute = new BigInteger("0");
            this.base.copyTo(compute);
            //log("VERIFY --> Base["+i+"] = " + compute.toString(16));
            //log("VERIFY --> Exp["+i+"] = " + splits[i].toString(16));
            //log("VERIFY --> Mod["+i+"] = " + this.mod.toString(16));
            compute = compute.modPow(splits[i],this.mod);
            //log("VERIFY --> Computation[" + i + "] = " + compute.toString(16));
            // compute MULTIPLY(base^r_i)
            finalResult = finalResult.multiply(compute).mod(this.mod);
        }
        var resStr = res.toString(16);
        var expStr = this.exp.toString(16);
        if (resStr != expStr) {
            throw new Error("exponent splitting is weird");
        }
        var finalStr = finalResult.toString(16);
        var expectedStr = this.base.modPow(this.exp,this.mod).toString(16);
        //log("VERIFY --> Final result: " + finalStr);
        //log("VERIFY --> Expected result: " + expectedStr);
        if (finalStr != expectedStr) {
            throw new Error("modular exponentiation does not work?");
        }
        //log("Splitting has been done correctly");
        return true;
    }
}

function randomInteger(bitLength) {
    var arr = new Array(bitLength/8);
    var r = new Random();
    r.nextBytes(arr);
    return new BigInteger(arr).abs();
}

registerModExp("outsource",OutsourceModExp,"Uses external webservers to compute the computation on blinded data. More info on how to run the servers in the /server folder.");
